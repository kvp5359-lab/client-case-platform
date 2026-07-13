/**
 * Edge Function: telegram-set-reaction
 * Синхронизация реакций из приложения в Telegram (setMessageReaction API)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/edge.ts";
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
      .select("workspace_id, integration_id")
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

    // Telegram setMessageReaction: реакция всегда «именная» — привязана к боту,
    // который её отправил. В multi-bot группе у каждого бота свой message_id для
    // одного сообщения. Поэтому ставим реакцию ботом РЕАГИРУЮЩЕГО и его СОБСТВЕННЫМ
    // message_id этого сообщения (из карты telegram_bot_msg_ids, копится при приёме
    // в _shared/syncTelegramIncomingMessage.ts). Если своего id нет — реакцию в TG
    // не ставим (чужим ботом = ложная подпись), она остаётся в сервисе.
    // Бот реагирующего: его личный employee-бот (owner_user_id = user.id), иначе
    // бот-секретарь группы (если он есть). Реакцию ставим ИМЕННО им — тогда в TG
    // корректная подпись.
    // Лид-DM (чат привязан к telegram_lead_bot): реакцию ставит САМ лид-бот.
    // У отвечающего сотрудника нет диалога с этим клиентом своим личным ботом,
    // а карта telegram_bot_msg_ids лид-входящих ведётся под ключом 'secretary'
    // (приём с asPersonalBot=null). Форсим лид-бота, минуя личный бот сотрудника.
    let isLeadChat = false;
    if (chat.integration_id) {
      const { data: leadInteg } = await supabaseAdmin
        .from("workspace_integrations")
        .select("type")
        .eq("id", chat.integration_id)
        .maybeSingle();
      isLeadChat = (leadInteg as { type: string } | null)?.type === "telegram_lead_bot";
    }

    let reactorToken: string | null = null;
    // Ключ бота в карте telegram_bot_msg_ids: employee — его integration id
    // (= workspace_integrations.id, тот же, что asPersonalBot.integrationId при
    // приёме), секретарь/лид-бот — литерал 'secretary'.
    let reactorBotKey: string | null = null;

    if (isLeadChat) {
      try {
        const lead = await resolveBotToken(supabaseAdmin, body.chat_id);
        reactorToken = lead.token;
        reactorBotKey = "secretary";
      } catch (e) {
        console.warn(
          "[telegram-set-reaction] lead bot token resolve failed:",
          e instanceof Error ? e.message : String(e),
        );
      }
    } else {
      const { data: empBots } = await supabaseAdmin
        .from("workspace_integrations")
        .select("id, config, secrets")
        .eq("workspace_id", convWorkspaceId)
        .eq("type", "telegram_employee_bot")
        .eq("is_active", true);
      const myBot = (empBots ?? []).find(
        (r) => (r.config as { owner_user_id?: string } | null)?.owner_user_id === user.id,
      );
      reactorToken = (myBot?.secrets as { token?: string } | null)?.token ?? null;
      reactorBotKey = myBot ? (myBot.id as string) : null;
      if (!reactorToken) {
        try {
          const sec = await resolveBotToken(supabaseAdmin, body.chat_id);
          reactorToken = sec.token;
          reactorBotKey = "secretary";
        } catch (e) {
          console.warn(
            "[telegram-set-reaction] no reactor bot (no personal, no secretary):",
            e instanceof Error ? e.message : String(e),
          );
        }
      }
    }

    // message_id ЭТОГО сообщения ДЛЯ бота реагирующего (в multi-bot группе у
    // каждого бота свой message_id — берём из карты telegram_bot_msg_ids).
    const { data: msgRow } = await supabaseAdmin
      .from("project_messages")
      .select("telegram_bot_msg_ids")
      .eq("telegram_chat_id", body.chat_id)
      .eq("telegram_message_id", body.message_id)
      .maybeSingle();
    const botMsgIds =
      (msgRow?.telegram_bot_msg_ids as Record<string, number> | null) ?? {};
    const msgIdForReactor =
      reactorBotKey != null ? botMsgIds[reactorBotKey] : undefined;

    if (!reactorToken || msgIdForReactor == null) {
      // Нет способа поставить реакцию ПРАВИЛЬНЫМ ботом: у бота реагирующего нет
      // своего message_id для этого сообщения (старое сообщение до карты, либо
      // его бот не видел сообщение). НЕ ставим чужим ботом (ложная подпись) —
      // реакция остаётся в сервисе. 200, чтобы фронт не показывал ошибку.
      console.warn("[telegram-set-reaction] no own message_id for reactor bot", {
        reactor_bot_key: reactorBotKey,
        has_token: !!reactorToken,
      });
      return new Response(
        JSON.stringify({ ok: false, skipped: true, reason: "no_own_message_id" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tgResponse = await fetch(
      `https://api.telegram.org/bot${reactorToken}/setMessageReaction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: body.chat_id,
          message_id: msgIdForReactor,
          reaction: body.reaction ?? [],
        }),
      },
    );
    const tgData = await tgResponse.json();
    if (tgData.ok) {
      return new Response(
        JSON.stringify({ ok: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    console.error("Telegram setMessageReaction failed:", {
      error_code: tgData.error_code,
      description: tgData.description,
    });
    return new Response(
      JSON.stringify({ error: "Telegram API error", description: tgData.description }),
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
