/**
 * Edge Function: telegram-set-reaction
 * Синхронизация реакций из приложения в Telegram (setMessageReaction API)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { safeJsonParse, findMissingField } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken } from "../_shared/telegramBotToken.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ReactionType {
  type: "emoji";
  emoji: string;
}

interface RequestBody {
  chat_id: number;
  message_id: number;
  reaction: ReactionType[];
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  // Авторизация: JWT
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

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
      ["chat_id", "message_id"],
    );
    if (missing) {
      return new Response(
        JSON.stringify({ error: `Missing field: ${missing}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (typeof body.chat_id !== "number" || typeof body.message_id !== "number") {
      return new Response(
        JSON.stringify({ error: "chat_id and message_id must be numbers" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (body.reaction !== undefined && !Array.isArray(body.reaction)) {
      return new Response(
        JSON.stringify({ error: "reaction must be an array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Z8-12: verify workspace membership via project_telegram_chats
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: chat } = await supabaseAdmin
      .from("project_telegram_chats")
      .select("workspace_id")
      .eq("telegram_chat_id", body.chat_id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    const convWorkspaceId = chat?.workspace_id;
    if (!chat || !convWorkspaceId) {
      return new Response(
        JSON.stringify({ error: "Chat not found" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const isMember = await checkWorkspaceMembership(supabaseAdmin, user.id, convWorkspaceId);
    if (!isMember) {
      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Выбираем токен бота по bot_version привязки группы (v1 или v2)
    const { token: TELEGRAM_BOT_TOKEN } = await resolveBotToken(supabaseAdmin, body.chat_id);

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setMessageReaction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: body.chat_id,
          message_id: body.message_id,
          reaction: body.reaction ?? [],
        }),
      },
    );

    const tgData = await tgResponse.json();

    if (!tgData.ok) {
      console.error("Telegram setMessageReaction error:", tgData);
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
    console.error("telegram-set-reaction error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
