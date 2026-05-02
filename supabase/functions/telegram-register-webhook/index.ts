/**
 * Edge Function: telegram-register-webhook
 *
 * Серверная регистрация/снятие Telegram-webhook'а у бота. Раньше браузер
 * звал setWebhook напрямую — если интернет упал в момент сохранения,
 * токен оставался в БД, а webhook не зарегистрирован → реплаи не
 * связывались. Теперь — серверный путь: фронт сохраняет токен в БД и
 * вызывает эту функцию. Функция читает токен из БД и зовёт Telegram API.
 *
 * Auth: JWT обычного пользователя. Проверяем, что юзер участник
 * воркспейса этой интеграции — этого достаточно, потому что на самой
 * таблице workspace_integrations RLS уже ограничивает запись правом
 * manage_workspace_settings.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

interface RequestBody {
  integration_id: string;
  action: "register" | "remove" | "refresh_avatar";
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("authorization");
  if (!auth) {
    return jsonResponse(
      { error: "Unauthorized" },
      { status: 401, corsHeaders },
    );
  }

  // Аутентифицируем юзера через ANON-клиент, чтобы получить user.id.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: userData, error: authErr } = await userClient.auth.getUser();
  if (authErr || !userData.user) {
    return jsonResponse(
      { error: "Unauthorized" },
      { status: 401, corsHeaders },
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, { status: 400, corsHeaders });
  }
  if (
    !body.integration_id ||
    !["register", "remove", "refresh_avatar"].includes(body.action)
  ) {
    return jsonResponse(
      {
        error:
          "integration_id and action='register'|'remove'|'refresh_avatar' required",
      },
      { status: 400, corsHeaders },
    );
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: integration, error: intErr } = await service
    .from("workspace_integrations")
    .select("id, workspace_id, type, config, secrets")
    .eq("id", body.integration_id)
    .maybeSingle();
  if (intErr || !integration) {
    return jsonResponse({ error: "Integration not found" }, { status: 404, corsHeaders });
  }

  // Проверяем, что юзер участник этого workspace.
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("user_id", userData.user.id)
    .eq("workspace_id", integration.workspace_id)
    .eq("is_deleted", false)
    .maybeSingle();
  if (!participant) {
    return jsonResponse({ error: "Forbidden" }, { status: 403, corsHeaders });
  }

  const token = (integration.secrets as { token?: string } | null)?.token;
  if (!token) {
    return jsonResponse(
      { error: "Token is not set on this integration" },
      { status: 400, corsHeaders },
    );
  }

  const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-webhook`;

  if (body.action === "register") {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: integration.id,
        allowed_updates: ["message", "edited_message", "message_reaction"],
        drop_pending_updates: true,
      }),
    });
    const tgData = await tgRes.json();

    // После успешной регистрации webhook'а — кэшируем аватарку бота в
    // нашем Storage. Url Telegram'а требует токен для доступа, поэтому
    // мы качаем файл и кладём в публичный participant-avatars bucket.
    if (tgData.ok) {
      try {
        const avatarUrl = await cacheBotAvatar(service, token, integration.id);
        if (avatarUrl) {
          await service
            .from("workspace_integrations")
            .update({
              config: {
                ...((integration.config as Record<string, unknown> | null) ?? {}),
                bot_avatar_url: avatarUrl,
              },
            })
            .eq("id", integration.id);
        }
      } catch (err) {
        // Не критично — webhook зарегистрирован, аватарка просто не появится.
        console.warn("[telegram-register-webhook] avatar fetch failed:", err);
      }
    }

    return jsonResponse(tgData, {
      status: tgData.ok ? 200 : 400,
      corsHeaders,
    });
  } else if (body.action === "refresh_avatar") {
    // Только обновляем аватарку, не трогая webhook. Используется для
    // первичного backfill уже подключённых ботов и для обновления, если
    // владелец сменил аватарку у бота в Telegram.
    const avatarUrl = await cacheBotAvatar(service, token, integration.id);
    if (avatarUrl) {
      await service
        .from("workspace_integrations")
        .update({
          config: {
            ...((integration.config as Record<string, unknown> | null) ?? {}),
            bot_avatar_url: avatarUrl,
          },
        })
        .eq("id", integration.id);
    }
    return jsonResponse(
      { ok: true, avatar_url: avatarUrl },
      { status: 200, corsHeaders },
    );
  } else {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
    });
    const tgData = await tgRes.json();
    return jsonResponse(tgData, {
      status: tgData.ok ? 200 : 400,
      corsHeaders,
    });
  }
});

function jsonResponse(
  body: unknown,
  opts: { status: number; corsHeaders: Record<string, string> },
): Response {
  return new Response(JSON.stringify(body), {
    status: opts.status,
    headers: { ...opts.corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Скачивает аватарку бота через Telegram API и кладёт в публичный bucket
 * participant-avatars. Возвращает публичный URL или null если у бота нет
 * аватарки / запрос упал.
 */
async function cacheBotAvatar(
  // deno-lint-ignore no-explicit-any
  service: any,
  token: string,
  integrationId: string,
): Promise<string | null> {
  // 1. Узнаём id бота через getMe
  const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meJson = (await meRes.json()) as {
    ok: boolean;
    result?: { id: number };
  };
  if (!meJson.ok || !meJson.result?.id) return null;

  // 2. Получаем фотки профиля бота
  const photosRes = await fetch(
    `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${meJson.result.id}&limit=1`,
  );
  const photosJson = (await photosRes.json()) as {
    ok: boolean;
    result?: { photos?: { file_id: string }[][] };
  };
  if (
    !photosJson.ok ||
    !photosJson.result?.photos?.length ||
    !photosJson.result.photos[0]?.length
  ) {
    return null;
  }
  const sizes = photosJson.result.photos[0];
  const photo = sizes[sizes.length - 1]; // последний — самый большой

  // 3. getFile → file_path
  const fileRes = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${photo.file_id}`,
  );
  const fileJson = (await fileRes.json()) as {
    ok: boolean;
    result?: { file_path?: string };
  };
  if (!fileJson.ok || !fileJson.result?.file_path) return null;

  // 4. Скачиваем
  const downloadRes = await fetch(
    `https://api.telegram.org/file/bot${token}/${fileJson.result.file_path}`,
  );
  if (!downloadRes.ok) return null;
  const blob = await downloadRes.blob();

  // 5. Заливаем в Supabase Storage. Bucket participant-avatars публичный.
  const storagePath = `bots/${integrationId}.jpg`;
  const { error: upErr } = await service.storage
    .from("participant-avatars")
    .upload(storagePath, blob, { contentType: "image/jpeg", upsert: true });
  if (upErr) {
    console.warn("[cacheBotAvatar] upload error:", upErr);
    return null;
  }

  const { data } = service.storage.from("participant-avatars").getPublicUrl(storagePath);
  // К URL добавляем параметр-крушитель кеша по integration_id, чтобы при
  // переподключении нового токена/аватарки фронт обновил картинку.
  return `${data.publicUrl}?t=${Date.now()}`;
}
