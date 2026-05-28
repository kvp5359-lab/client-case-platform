/**
 * Edge Function: telegram-set-reaction
 * Синхронизация реакций из приложения в Telegram (setMessageReaction API)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
import { safeJsonParse, findMissingField } from "../_shared/validation.ts";
import { checkWorkspaceMembership } from "../_shared/safeErrorResponse.ts";
import { resolveBotToken, resolveTokenByIntegrationId } from "../_shared/telegramBotToken.ts";

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
  const corsHeaders = corsHeadersFor(req);

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

    // Z8-12: verify workspace membership via project_telegram_chats.
    // Telegram Business: setMessageReaction НЕ поддерживает business_connection_id
    // на стороне Telegram Bot API, поэтому реакции в личных business-чатах
    // не отправляем (фронт сам не вызывает функцию для business-сообщений).
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

    // Telegram setMessageReaction: реакция всегда «именная» — привязана к
    // конкретному боту, который её отправил. В групповом чате с несколькими
    // ботами это означает: реакция от реагирующего сотрудника должна идти
    // через ЕГО личный бот, иначе все участники видят «Иванов отреагировал»,
    // хотя на самом деле — Петров.
    //
    // Приоритет цепочки кандидатов:
    //   1) Личный бот реагирующего пользователя (telegram_employee_bot c
    //      owner_user_id = user.id) — корректная атрибуция реакции в TG.
    //   2) Бот, отправивший оригинал (telegram_bot_integration_id).
    //   3) Бот-секретарь группы (resolveBotToken по chat_id).
    //
    // Шлём по очереди. Если бот не в группе ("chat not found" / "member not
    // found"), пробуем следующего. На других ошибках TG (например невалидный
    // emoji) — прерываем цепочку, fallback не поможет. Это закрывает кейс
    // владельца с личным ботом, но в группе только секретарь — раньше функция
    // выбирала первого кандидата и 502'ила, теперь fallback'нёт на секретаря.
    const candidates: { token: string; label: string }[] = [];

    const { data: empBots } = await supabaseAdmin
      .from("workspace_integrations")
      .select("id, is_active, config, secrets")
      .eq("workspace_id", convWorkspaceId)
      .eq("type", "telegram_employee_bot")
      .eq("is_active", true);
    const myBot = (empBots ?? []).find(
      (r) => (r.config as { owner_user_id?: string } | null)?.owner_user_id === user.id,
    );
    const myBotToken = (myBot?.secrets as { token?: string } | null)?.token ?? null;
    if (myBotToken) candidates.push({ token: myBotToken, label: "personal_bot" });

    const { data: msgRow } = await supabaseAdmin
      .from("project_messages")
      .select("telegram_bot_integration_id")
      .eq("telegram_chat_id", body.chat_id)
      .eq("telegram_message_id", body.message_id)
      .maybeSingle();
    const savedIntegrationId =
      (msgRow?.telegram_bot_integration_id as string | null) ?? null;
    if (savedIntegrationId) {
      const fromIntegration = await resolveTokenByIntegrationId(
        supabaseAdmin,
        savedIntegrationId,
      );
      if (fromIntegration && !candidates.some((c) => c.token === fromIntegration.token)) {
        candidates.push({ token: fromIntegration.token, label: "original_sender_bot" });
      }
    }

    const fallback = await resolveBotToken(supabaseAdmin, body.chat_id);
    if (!candidates.some((c) => c.token === fallback.token)) {
      candidates.push({ token: fallback.token, label: "secretary_bot" });
    }

    // «Бот не в группе» — единственный ретраябельный класс ошибок.
    // Остальные ошибки (REACTION_INVALID, MESSAGE_NOT_MODIFIED и т.п.)
    // вернутся одинаково на любом боте — нет смысла спамить TG API.
    const isNotMemberError = (description: string | undefined): boolean => {
      if (!description) return false;
      return /chat not found|not a member|member not found|user_not_participant/i.test(
        description,
      );
    };

    let lastDescription: string | undefined;
    let lastErrorCode: number | undefined;
    for (const { token, label } of candidates) {
      const tgResponse = await fetch(
        `https://api.telegram.org/bot${token}/setMessageReaction`,
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
      if (tgData.ok) {
        return new Response(
          JSON.stringify({ ok: true, sent_by: label }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      lastDescription = tgData.description;
      lastErrorCode = tgData.error_code;
      console.warn(
        `Telegram setMessageReaction failed via ${label}:`,
        JSON.stringify({ error_code: tgData.error_code, description: tgData.description }),
      );
      if (!isNotMemberError(tgData.description)) {
        // Не «бот не в группе» — fallback не поможет.
        break;
      }
    }

    console.error("Telegram setMessageReaction exhausted candidates:", {
      candidates_tried: candidates.length,
      last_error_code: lastErrorCode,
      last_description: lastDescription,
    });
    return new Response(
      JSON.stringify({ error: "Telegram API error", description: lastDescription }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("telegram-set-reaction error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
