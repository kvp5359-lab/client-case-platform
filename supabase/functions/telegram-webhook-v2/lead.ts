/**
 * Лид-бот: приёмник холодных лидов через рекламного бота (mode='lead').
 *
 * Обычный бот, которого рекламируют. Клиент пишет ему в личку → создаётся
 * личный диалог (project_id=NULL) с меткой кампании. Пул ответственных
 * (config.responsible_user_ids) добавляется в участники треда — «все видят всё».
 *
 * Связь диалог↔клиент↔бот держит project_telegram_chats
 * (telegram_chat_id = id клиента, integration_id = лид-бот) — та же строка
 * обслуживает и приём (поиск существующего треда), и отправку ответов
 * (dispatch_message_to_channels → telegram-send-message резолвит бота отсюда).
 *
 * source входящих = 'telegram' (в skip-list триггера отправки + покрыт
 * content-dedup индексом). «Канал лид» определяется фактом привязки к лид-боту.
 */

import { service, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./shared.ts";
import { downloadAttachments } from "./media.ts";
import { formatUserName, extractForward } from "./pure.ts";
import { sendMessage } from "./tg-api.ts";
import { telegramEntitiesToHtml } from "../_shared/telegramEntitiesToHtml.ts";
import {
  syncTelegramIncomingMessage,
  applyTelegramEdit,
} from "../_shared/syncTelegramIncomingMessage.ts";
import { ensureDirectThread } from "../_shared/ensureDirectThread.ts";
import type { IntegrationContext, TgMessage } from "./types.ts";

interface LeadBotConfig {
  /** Главный ответственный (owner треда). Если пусто — берётся первый из пула. */
  owner_user_id?: string;
  /** Пул ответственных — попадают в участники треда («все видят всё»). */
  responsible_user_ids?: string[];
  /** Приветствие, отправляется при первом контакте. */
  welcome_message?: string;
  /** Базовая метка кампании на бота (детализация — из deep-link ?start=). */
  base_campaign?: string;
}

/** Добавить пул ответственных в участники треда (доступ + «все видят всё»). */
async function addResponsibleMembers(
  threadId: string,
  workspaceId: string,
  userIds: string[],
): Promise<void> {
  if (!userIds.length) return;
  const { data: parts } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", workspaceId)
    .in("user_id", userIds)
    .eq("is_deleted", false);
  if (!parts?.length) return;
  const rows = parts.map((p) => ({ thread_id: threadId, participant_id: p.id as string }));
  await service
    .from("project_thread_members")
    .upsert(rows, { onConflict: "thread_id,participant_id", ignoreDuplicates: true });
}

export async function handleLeadMessage(
  msg: TgMessage,
  isEdited: boolean,
  ctx: IntegrationContext,
): Promise<void> {
  if (!msg.from) return;
  const clientTgUserId = msg.from.id;
  const clientUsername = msg.from.username ?? null;
  const clientDisplayName =
    formatUserName(msg.from) ||
    (clientUsername ? `@${clientUsername}` : `tg:${clientTgUserId}`);
  const rawText = msg.text ?? msg.caption ?? "";

  // /start <payload> из рекламной ссылки t.me/<bot>?start=<payload> — метка кампании.
  const isStart = !isEdited && rawText.startsWith("/start");
  const startPayload = isStart ? (rawText.split(/\s+/)[1] ?? null) : null;

  // Настройки бота (ответственные, приветствие, метка).
  const { data: integ } = await service
    .from("workspace_integrations")
    .select("config")
    .eq("id", ctx.id)
    .maybeSingle();
  const config = (integ?.config ?? {}) as LeadBotConfig;

  // Существующий диалог этого клиента с этим лид-ботом?
  const { data: existingBinding } = await service
    .from("project_telegram_chats")
    .select("thread_id, project_id")
    .eq("telegram_chat_id", clientTgUserId)
    .eq("integration_id", ctx.id)
    .eq("is_active", true)
    .maybeSingle();

  let threadId: string;
  let projectId: string | null = null;

  if (existingBinding?.thread_id) {
    threadId = existingBinding.thread_id as string;
    projectId = (existingBinding.project_id as string | null) ?? null;
  } else {
    // Новый холодный лид → личный диалог (project_id=NULL).
    const ownerUserId =
      config.owner_user_id ?? config.responsible_user_ids?.[0] ?? null;

    const created = await ensureDirectThread(service, {
      workspaceId: ctx.workspaceId,
      ownerUserId,
      clientTgUserId,
      clientDisplayName,
      channelDefaultKey: "telegram_personal",
      fallbackIcon: "telegram",
      fallbackAccent: "blue",
      // Существующий тред уже проверили через binding выше.
      findExistingThreadId: async () => null,
      extraColumns: {
        lead_source: {
          bot_integration_id: ctx.id,
          campaign: config.base_campaign ?? null,
          start_payload: startPayload,
        },
      },
    });
    threadId = created.threadId;

    // Связь диалог↔клиент↔бот — обслуживает и приём, и отправку ответов.
    await service.from("project_telegram_chats").insert({
      thread_id: threadId,
      project_id: null,
      workspace_id: ctx.workspaceId,
      telegram_chat_id: clientTgUserId,
      integration_id: ctx.id,
      channel: "client",
      bot_version: "v2",
      is_active: true,
    });

    // Пул ответственных → участники треда.
    await addResponsibleMembers(
      threadId,
      ctx.workspaceId,
      config.responsible_user_ids ?? [],
    );

    // Приветствие — только при первом контакте.
    if (config.welcome_message) {
      await sendMessage(clientTgUserId, config.welcome_message);
    }
  }

  // @username в карточку контакта (зеркало Business/MTProto).
  if (clientUsername) {
    await service
      .from("participants")
      .update({ telegram_username: clientUsername })
      .eq("workspace_id", ctx.workspaceId)
      .eq("telegram_user_id", clientTgUserId)
      .or(`telegram_username.is.null,telegram_username.neq.${clientUsername}`);
  }

  // Саму команду /start в ленту не пишем (тред создан, приветствие ушло).
  if (isStart) return;

  const text = telegramEntitiesToHtml(rawText, msg.entities ?? msg.caption_entities);

  if (isEdited) {
    await applyTelegramEdit(service, {
      chatId: clientTgUserId,
      telegramMessageId: msg.message_id,
      newContent: text || rawText,
      asPersonalBot: null,
    });
    return;
  }

  // Participant отправителя (создан ensureDirectThread при новом треде).
  const { data: contact } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", ctx.workspaceId)
    .eq("telegram_user_id", clientTgUserId)
    .eq("is_deleted", false)
    .maybeSingle();

  const sync = await syncTelegramIncomingMessage(service, {
    message: msg,
    binding: {
      project_id: projectId,
      workspace_id: ctx.workspaceId,
      channel: "client",
      thread_id: threadId,
    },
    text,
    senderName: clientDisplayName,
    senderParticipantId: (contact?.id as string | null) ?? null,
    forwardInfo: extractForward(msg),
    asPersonalBot: null,
    source: "telegram",
    senderRole: "Клиент",
  });

  // Вложения — только при настоящем INSERT (см. downloadAttachments в sync.ts).
  // project_id=NULL → в пути storage используем thread_id вместо проекта.
  if (sync.outcome === "inserted" && sync.rowId) {
    await downloadAttachments(
      msg,
      sync.rowId,
      ctx.workspaceId,
      projectId ?? threadId,
      ctx.botToken,
    );
  }

  // Аватар клиента (fire-and-forget, кэш-функция дедуплицирует).
  if (msg.from?.id && !msg.from.is_bot) {
    fetch(`${SUPABASE_URL}/functions/v1/fetch-telegram-avatar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ tg_user_id: msg.from.id }),
    }).catch(() => {});
  }
}
