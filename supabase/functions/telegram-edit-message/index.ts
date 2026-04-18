/**
 * Edge Function: telegram-edit-message
 * Редактирование сообщения в Telegram-группе (editMessageText)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, findMissingField, isValidUUID } from "../_shared/validation.ts";
import { htmlToTelegramHtml, escapeHtmlEntities, isHtmlContent } from "../_shared/htmlFormatting.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";

interface RequestBody {
  message_id: string;
  project_id?: string;
  content: string;
  sender_name: string;
  sender_role: string | null;
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
  const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;

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
      ["content", "sender_name", "telegram_chat_id", "telegram_message_id"],
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

    // B-80: проверка workspace membership для JWT-вызовов
    if (authenticatedUserId) {
      if (!body.message_id || !isValidUUID(body.message_id)) {
        return new Response(
          JSON.stringify({ error: "Access denied" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data: msg } = await serviceClient
        .from("project_messages")
        .select("project_id, projects!inner(workspace_id)")
        .eq("id", body.message_id)
        .maybeSingle();

      const workspaceId = (msg?.projects as unknown as { workspace_id: string })?.workspace_id;
      if (workspaceId) {
        const isMember = await checkWorkspaceMembership(serviceClient, authenticatedUserId, workspaceId);
        if (!isMember) {
          return new Response(
            JSON.stringify({ error: "Access denied" }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    } // end authenticatedUserId

    // Формируем текст в HTML
    const contentForTelegram = isHtmlContent(body.content)
      ? htmlToTelegramHtml(body.content)
      : escapeHtmlEntities(body.content);
    const formattedText = `<b>${escapeHtmlEntities(body.sender_name)}:</b>\n${contentForTelegram}`;

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: body.telegram_chat_id,
          message_id: body.telegram_message_id,
          text: formattedText,
          parse_mode: "HTML",
        }),
      },
    );

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      console.error("Telegram editMessageText error:", tgData);
      return new Response(
        JSON.stringify({ error: "Telegram API error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("telegram-edit-message error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
