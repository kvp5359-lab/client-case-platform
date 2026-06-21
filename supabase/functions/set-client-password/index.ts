/**
 * Edge Function: set-client-password
 *
 * Менеджер/владелец воркспейса выдаёт участнику (обычно клиенту) доступ по
 * паролю: сервер генерирует пароль, создаёт ему auth-аккаунт (если ещё нет),
 * привязывает `participants.user_id`, ставит `can_login = true` и снимает бан.
 *
 * Сгенерированный пароль возвращается в ответе ОДИН раз — фронт показывает его
 * менеджеру для отправки клиенту. В хранилище Supabase пароль лежит только в
 * виде хеша и повторно показан быть не может (нужен «сброс» — новый пароль).
 *
 * Логин клиента = его email (`participants.email`).
 *
 * Действия:
 *  - participant без user_id → создаём auth-юзера (email + password,
 *    email_confirm=true) и привязываем user_id;
 *  - participant с user_id → меняем пароль существующему + снимаем бан;
 *  - если auth-юзер с таким email уже существует (клиент когда-то заходил сам)
 *    — не плодим второго, а привязываемся к нему и ставим пароль.
 *
 * Auth: Bearer JWT вызывающего. Права — `is_workspace_owner` или
 * `has_workspace_permission(..., 'manage_workspace_settings')` (как в
 * set-participant-access). Деплой БЕЗ --no-verify-jwt (вызывает залогиненный
 * менеджер из UI).
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  getServiceClient,
  getUser,
  jsonRes,
  preflight,
} from "../_shared/edge.ts";

interface RequestBody {
  participant_id: string;
}

// Набор без визуально неоднозначных символов (0/O, 1/l/I) — пароль читаемый,
// клиенту проще ввести, если копипаст не сработал.
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PASSWORD_LENGTH = 12;

function generatePassword(): string {
  const bytes = new Uint8Array(PASSWORD_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

type ServiceClient = ReturnType<typeof getServiceClient>;

/**
 * Ищет auth-юзера по email перебором страниц admin.listUsers.
 * Нужно, когда createUser упал с «email уже занят» (клиент регистрировался
 * сам). На текущем масштабе перебор приемлем.
 */
async function findAuthUserIdByEmail(
  service: ServiceClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await service.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) return null;
    const match = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < 200) return null; // последняя страница
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return jsonRes({ error: "Method not allowed" }, 405, req);
  }

  const caller = await getUser(req);
  if (!caller) return jsonRes({ error: "Unauthorized" }, 401, req);

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonRes({ error: "Invalid JSON" }, 400, req);
  }
  if (!body.participant_id) {
    return jsonRes({ error: "participant_id is required" }, 400, req);
  }

  const service = getServiceClient();

  const { data: participant, error: pErr } = await service
    .from("participants")
    .select("id, workspace_id, user_id, email, is_deleted")
    .eq("id", body.participant_id)
    .maybeSingle();

  if (pErr || !participant || participant.is_deleted) {
    return jsonRes({ error: "Participant not found" }, 404, req);
  }

  // --- Проверка прав (owner или manage_workspace_settings) ---
  const isOwner = await service.rpc("is_workspace_owner", {
    p_user_id: caller.id,
    p_workspace_id: participant.workspace_id,
  });
  let allowed = isOwner.data === true;
  if (!allowed) {
    const { data: hasPerm } = await service.rpc("has_workspace_permission", {
      p_user_id: caller.id,
      p_workspace_id: participant.workspace_id,
      p_permission: "manage_workspace_settings",
    });
    allowed = hasPerm === true;
  }
  if (!allowed) {
    return jsonRes({ error: "Forbidden" }, 403, req);
  }

  const email = (participant.email ?? "").trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return jsonRes({ error: "no_email" }, 400, req);
  }

  const password = generatePassword();
  let userId = participant.user_id as string | null;

  if (userId) {
    // Аккаунт уже привязан — просто ставим новый пароль и снимаем бан.
    const { error } = await service.auth.admin.updateUserById(userId, {
      password,
      ban_duration: "none",
    });
    if (error) {
      console.error("[set-client-password] update existing failed:", error.message);
      return jsonRes({ error: "auth_update_failed" }, 500, req);
    }
  } else {
    // Аккаунта нет — создаём. Если email уже занят (клиент заходил сам) —
    // привязываемся к существующему и ставим пароль.
    const { data: created, error: createErr } = await service.auth.admin
      .createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr) {
      const existingId = await findAuthUserIdByEmail(service, email);
      if (!existingId) {
        console.error("[set-client-password] create failed:", createErr.message);
        return jsonRes({ error: "auth_create_failed" }, 500, req);
      }
      const { error: updErr } = await service.auth.admin.updateUserById(
        existingId,
        { password, ban_duration: "none" },
      );
      if (updErr) {
        console.error("[set-client-password] update existing failed:", updErr.message);
        return jsonRes({ error: "auth_update_failed" }, 500, req);
      }
      userId = existingId;
    } else {
      userId = created.user?.id ?? null;
    }

    if (!userId) {
      return jsonRes({ error: "auth_create_failed" }, 500, req);
    }
  }

  // Привязываем user_id и открываем доступ.
  const { error: linkErr } = await service
    .from("participants")
    .update({ user_id: userId, can_login: true })
    .eq("id", participant.id);

  if (linkErr) {
    console.error("[set-client-password] link participant failed:", linkErr.message);
    return jsonRes({ error: "link_failed" }, 500, req);
  }

  return jsonRes({ ok: true, login: email, password }, 200, req);
});
