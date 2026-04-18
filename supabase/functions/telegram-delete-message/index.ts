/**
 * Edge Function: telegram-delete-message
 * Удаление сообщения в Telegram-группе (deleteMessage)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, findMissingField } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken } from "../_shared/telegramBotToken.ts";

interface RequestBody {
  telegram_chat_id: number;
  telegram_message_id: number;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Авторизация: JWT (клиент) или внутренний секрет (pg_net trigger)
  const authHeader = req.headers.get("authorization");
  const internalSecret = req.headers.get("x-internal-secret");
  const expectedSecret = Deno.env.get("INTERNAL_FUNCTION_SECRET");

  let authenticatedUserId: string | null = null;

  if (internalSecret) {
    if (!expectedSecret || internalSecret !== expectedSecret) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } else if (authHeader) {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    authenticatedUserId = user.id;
  } else {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = safeJsonParse<RequestBody>(await req.text());
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const missing = findMissingField(
      body as unknown as Record<string, unknown>,
      ["telegram_chat_id", "telegram_message_id"],
    );
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (typeof body.telegram_chat_id !== "number" || typeof body.telegram_message_id !== "number") {
      return new Response(
        JSON.stringify({ error: "telegram_chat_id and telegram_message_id must be numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Выбираем токен бота по bot_version привязки группы (v1 или v2)
    const { token: TELEGRAM_BOT_TOKEN } = await resolveBotToken(serviceClient, body.telegram_chat_id);

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

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: body.telegram_chat_id,
          message_id: body.telegram_message_id,
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
