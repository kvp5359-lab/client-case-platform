/**
 * Edge Function: telegram-delete-message
 * Удаление сообщения в Telegram-группе (deleteMessage)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor, resolveInternalOrUserAuth } from "../_shared/edge.ts";
import { safeJsonParse, findMissingField } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken, resolveTokenByIntegrationId } from "../_shared/telegramBotToken.ts";

interface RequestBody {
  telegram_chat_id: number;
  /** Одиночный id (легаси). */
  telegram_message_id?: number;
  /** Несколько id (альбом/медиагруппа) — deleteMessages. */
  telegram_message_ids?: number[];
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Авторизация: JWT (клиент) или внутренний секрет (pg_net trigger)
  const auth = await resolveInternalOrUserAuth(req);
  if (auth instanceof Response) return auth;
  const authenticatedUserId = auth.userId;

  try {
    const body = safeJsonParse<RequestBody>(await req.text());
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (typeof body.telegram_chat_id !== "number") {
      return new Response(
        JSON.stringify({ error: "telegram_chat_id must be a number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Собираем список id: массив (медиагруппа) имеет приоритет, иначе одиночный.
    const idsToDelete: number[] = Array.isArray(body.telegram_message_ids)
      && body.telegram_message_ids.length > 0
      ? body.telegram_message_ids.filter((n) => typeof n === "number")
      : (typeof body.telegram_message_id === "number" ? [body.telegram_message_id] : []);

    if (idsToDelete.length === 0) {
      return new Response(
        JSON.stringify({ error: "telegram_message_id or telegram_message_ids required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const firstMessageId = idsToDelete[0];

    // Сначала ищем, через какого бота было отправлено сообщение — Telegram
    // позволяет удалять только тем же ботом. Если сохранён integration_id,
    // используем его токен. Иначе — fallback на бота-секретаря.
    let TELEGRAM_BOT_TOKEN: string;
    {
      const { data: msgRow } = await serviceClient
        .from("project_messages")
        .select("telegram_bot_integration_id")
        .eq("telegram_chat_id", body.telegram_chat_id)
        .eq("telegram_message_id", firstMessageId)
        .maybeSingle();
      const savedIntegrationId =
        (msgRow?.telegram_bot_integration_id as string | null) ?? null;
      const fromIntegration = savedIntegrationId
        ? await resolveTokenByIntegrationId(serviceClient, savedIntegrationId)
        : null;
      if (fromIntegration) {
        TELEGRAM_BOT_TOKEN = fromIntegration.token;
      } else {
        const fallback = await resolveBotToken(serviceClient, body.telegram_chat_id);
        TELEGRAM_BOT_TOKEN = fallback.token;
      }
    }

    // B-80: проверка workspace membership для JWT-вызовов
    if (authenticatedUserId) {
      const { data: tgChat } = await serviceClient
        .from("project_telegram_chats")
        .select("workspace_id")
        .eq("telegram_chat_id", body.telegram_chat_id)
        .eq("is_active", true)
        .maybeSingle();

      if (!tgChat?.workspace_id) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const isMember = await checkWorkspaceMembership(serviceClient, authenticatedUserId, tgChat.workspace_id);
      if (!isMember) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Один id → deleteMessage (как раньше). Несколько → deleteMessages
    // (Bot API, до 100 id одного чата, тот же лимит 48 ч).
    const tgResponse = idsToDelete.length === 1
      ? await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: body.telegram_chat_id,
            message_id: firstMessageId,
          }),
        },
      )
      : await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: body.telegram_chat_id,
            message_ids: idsToDelete,
          }),
        },
      );

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      // Не блокируем — сообщение может быть старше 48 часов
      console.warn("Telegram deleteMessage failed (non-blocking):", tgData.description);
      return new Response(
        JSON.stringify({ ok: false, telegram_error: "Message could not be deleted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("telegram-delete-message error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
