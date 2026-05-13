/**
 * Edge Function: set-participant-access
 *
 * Менеджер/владелец воркспейса меняет флаг `participants.can_login`
 * (блокировка/разблокировка участника). В отличие от прямого UPDATE
 * через RLS, эта функция дополнительно:
 *
 *  1) если у заблокированного participant'а есть `user_id` и нет других
 *     активных participants в других воркспейсах — баним юзера в
 *     `auth.users` (banned_until = +100 лет), чтобы он не смог залогиниться;
 *  2) сбрасываем все его refresh-токены (`auth.sessions`/`auth.refresh_tokens`)
 *     — иначе текущая сессия проживёт до истечения access-token (1ч);
 *  3) при разблокировке снимаем бан.
 *
 * Без этих шагов `can_login` оставался внутренним флагом UI — реальный
 * логин/сессии не закрывались.
 *
 * Auth: Bearer JWT вызывающего. Проверка прав — через RPC
 * `is_workspace_owner` или `has_workspace_permission(..., 'manage_workspace_settings')`.
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
  can_login: boolean;
}

// 100 лет — фактический permanent ban.
const PERMANENT_BAN_DURATION = "876000h";

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
  if (!body.participant_id || typeof body.can_login !== "boolean") {
    return jsonRes(
      { error: "participant_id and can_login are required" },
      400,
      req,
    );
  }

  const service = getServiceClient();

  const { data: participant, error: pErr } = await service
    .from("participants")
    .select("id, workspace_id, user_id, can_login, workspace_roles")
    .eq("id", body.participant_id)
    .maybeSingle();

  if (pErr || !participant) {
    return jsonRes({ error: "Participant not found" }, 404, req);
  }

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

  // Нельзя заблокировать владельца воркспейса.
  const roles = (participant.workspace_roles as string[] | null) ?? [];
  if (body.can_login === false && roles.includes("Владелец")) {
    return jsonRes(
      { error: "Cannot block workspace owner" },
      400,
      req,
    );
  }

  // Запрет блокировать самого себя — чтобы менеджер не выбил себе доступ.
  if (body.can_login === false && participant.user_id === caller.id) {
    return jsonRes({ error: "Cannot block yourself" }, 400, req);
  }

  const { error: upErr } = await service
    .from("participants")
    .update({ can_login: body.can_login })
    .eq("id", participant.id);

  if (upErr) {
    return jsonRes({ error: upErr.message }, 500, req);
  }

  let authAction: "banned" | "unbanned" | "skipped" = "skipped";

  if (participant.user_id) {
    if (body.can_login === false) {
      // Проверяем, остались ли другие активные participants у этого user_id
      // в других воркспейсах. Если есть — не баним в auth, чтобы не выбить
      // его из других WS. Server-side guard в layout закроет ему доступ
      // только к этому воркспейсу.
      const { count } = await service
        .from("participants")
        .select("id", { count: "exact", head: true })
        .eq("user_id", participant.user_id)
        .eq("can_login", true)
        .eq("is_deleted", false)
        .neq("id", participant.id);

      if ((count ?? 0) === 0) {
        const { error: banErr } = await service.auth.admin.updateUserById(
          participant.user_id,
          { ban_duration: PERMANENT_BAN_DURATION },
        );
        if (banErr) {
          console.error("[set-participant-access] ban failed:", banErr);
        } else {
          authAction = "banned";
        }
      }

      // В любом случае сбрасываем активные сессии этого юзера: даже если
      // у него есть другие WS, текущая сессия могла смотреть в заблокированный
      // воркспейс и иметь активный access-token.
      await revokeUserSessions(service, participant.user_id);
    } else {
      // Разблокировка: снимаем бан, если он был.
      const { error: unbanErr } = await service.auth.admin.updateUserById(
        participant.user_id,
        { ban_duration: "none" },
      );
      if (unbanErr) {
        console.error("[set-participant-access] unban failed:", unbanErr);
      } else {
        authAction = "unbanned";
      }
    }
  }

  return jsonRes(
    { ok: true, can_login: body.can_login, auth_action: authAction },
    200,
    req,
  );
});

async function revokeUserSessions(
  service: ReturnType<typeof getServiceClient>,
  userId: string,
): Promise<void> {
  // Удаляем все sessions/refresh-tokens юзера через service-role SQL.
  // signOut(jwt) у auth.admin требует access-token юзера, которого у нас нет.
  const { error } = await service.rpc("revoke_all_user_sessions", {
    p_user_id: userId,
  });
  if (error) {
    console.error("[set-participant-access] revoke sessions failed:", error);
  }
}
