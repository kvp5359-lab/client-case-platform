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
import { createDirectThread } from "../_shared/createDirectThread.ts";
import type { IntegrationContext, TgMessage } from "./types.ts";

interface LeadBotConfig {
  /** Главный ответственный (owner треда). Если пусто — берётся первый из пула. */
  owner_user_id?: string;
  /** Пул ответственных — попадают в участники треда («все видят всё»).
   *  Используется, только если НЕ задан template_id (иначе исполнители из шаблона). */
  responsible_user_ids?: string[];
  /** Шаблон диалога: иконка/цвет/статус/дедлайн/доступ/исполнители нового чата. */
  template_id?: string;
  /** Приветствие, отправляется при первом контакте. */
  welcome_message?: string;
  /** Базовая метка кампании на бота (детализация — из deep-link ?start=). */
  base_campaign?: string;
}

/** Поля треда из шаблона диалога (thread_templates), применяемые к новому лид-диалогу. */
interface LeadTemplateApply {
  icon?: string;
  accentColor?: string;
  /** Доп. колонки треда (status_id, deadline, access_type, access_roles). */
  extraColumns: Record<string, unknown>;
  /** participant_id[] исполнителей шаблона → task_assignees. */
  assigneeIds: string[];
}

/**
 * Читает шаблон диалога лид-бота и раскладывает его поля для применения к
 * создаваемому треду. Зеркалит фронтовый applyTemplate, но для канала-приёма:
 * имя треда берётся по контакту (не из шаблона), первое сообщение шаблона не
 * применяется (у лид-бота своё приветствие). Нет шаблона → пустой результат.
 */
async function resolveLeadTemplate(
  templateId: string | undefined,
): Promise<LeadTemplateApply> {
  const empty: LeadTemplateApply = { extraColumns: {}, assigneeIds: [] };
  if (!templateId) return empty;

  const { data } = await service
    .from("thread_templates")
    .select(
      "icon, accent_color, default_status_id, deadline_days, access_type, access_roles, thread_template_assignees(participant_id)",
    )
    .eq("id", templateId)
    .maybeSingle();
  if (!data) return empty;

  const tpl = data as {
    icon: string | null;
    accent_color: string | null;
    default_status_id: string | null;
    deadline_days: number | null;
    access_type: string | null;
    access_roles: string[] | null;
    thread_template_assignees: { participant_id: string }[] | null;
  };

  const extraColumns: Record<string, unknown> = {};
  if (tpl.default_status_id) extraColumns.status_id = tpl.default_status_id;
  if (tpl.deadline_days != null) {
    extraColumns.deadline = new Date(
      Date.now() + tpl.deadline_days * 86_400_000,
    ).toISOString();
  }
  if (tpl.access_type) extraColumns.access_type = tpl.access_type;
  if (tpl.access_roles) extraColumns.access_roles = tpl.access_roles;

  return {
    icon: tpl.icon ?? undefined,
    accentColor: tpl.accent_color ?? undefined,
    extraColumns,
    assigneeIds: (tpl.thread_template_assignees ?? []).map((a) => a.participant_id),
  };
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
    .select("id, thread_id, project_id")
    .eq("telegram_chat_id", clientTgUserId)
    .eq("integration_id", ctx.id)
    .eq("is_active", true)
    .maybeSingle();

  let threadId: string | null = null;
  let projectId: string | null = null;

  if (existingBinding?.thread_id) {
    // Тред мог быть удалён в корзину — тогда пишем не в него, а заводим новый.
    const { data: t } = await service
      .from("project_threads")
      .select("id, project_id, is_deleted")
      .eq("id", existingBinding.thread_id as string)
      .maybeSingle();
    if (t && (t as { is_deleted?: boolean }).is_deleted !== true) {
      threadId = (t as { id: string }).id;
      projectId = (t as { project_id: string | null }).project_id ?? null;
    } else {
      // Тред удалён → деактивируем протухший binding, заведём новый ниже.
      await service
        .from("project_telegram_chats")
        .update({ is_active: false })
        .eq("id", existingBinding.id as string);
    }
  }

  if (!threadId) {
    // Новый холодный лид → личный диалог (project_id=NULL).
    const ownerUserId =
      config.owner_user_id ?? config.responsible_user_ids?.[0] ?? null;

    // Шаблон диалога (если у бота задан) — иконка/цвет/статус/дедлайн/доступ +
    // исполнители. Иконку/цвет из шаблона кладём в extraColumns, чтобы перебить
    // channel_defaults, которые проставляет createDirectThread.
    const tpl = await resolveLeadTemplate(config.template_id);

    const created = await createDirectThread(service, {
      workspaceId: ctx.workspaceId,
      ownerUserId,
      clientTgUserId,
      clientDisplayName,
      channelDefaultKey: "telegram_personal",
      fallbackIcon: "telegram",
      fallbackAccent: "blue",
      extraColumns: {
        lead_source: {
          bot_integration_id: ctx.id,
          campaign: config.base_campaign ?? null,
          start_payload: startPayload,
        },
        ...tpl.extraColumns,
        ...(tpl.icon ? { icon: tpl.icon } : {}),
        ...(tpl.accentColor ? { accent_color: tpl.accentColor } : {}),
      },
    });

    // Занимаем связь диалог↔клиент↔бот. Partial unique
    // (telegram_chat_id, integration_id) WHERE is_active защищает от гонки:
    // клиент нажал Start и сразу написал → два webhook'а параллельно. Кто
    // вставил binding первым — владелец диалога; проигравший удаляет свой
    // пустой тред и подхватывает диалог победителя (welcome/участники — у
    // победителя, дубля приветствия нет).
    const { error: bindErr } = await service.from("project_telegram_chats").insert({
      thread_id: created.threadId,
      project_id: null,
      workspace_id: ctx.workspaceId,
      telegram_chat_id: clientTgUserId,
      integration_id: ctx.id,
      channel: "client",
      bot_version: "v2",
      is_active: true,
    });

    if (bindErr) {
      if (bindErr.code === "23505") {
        // Гонка: другой webhook уже создал диалог. Удаляем свой пустой тред и
        // подхватываем диалог победителя.
        await service.from("project_threads").delete().eq("id", created.threadId);
        const { data: winner } = await service
          .from("project_telegram_chats")
          .select("thread_id, project_id")
          .eq("telegram_chat_id", clientTgUserId)
          .eq("integration_id", ctx.id)
          .eq("is_active", true)
          .maybeSingle();
        threadId = (winner?.thread_id as string | null) ?? created.threadId;
        projectId = (winner?.project_id as string | null) ?? null;
      } else {
        throw bindErr;
      }
    } else {
      threadId = created.threadId;
      // Исполнители: из шаблона (task_assignees) при заданном template_id, иначе
      // пул ответственных → участники треда (project_thread_members). Оба дают
      // доступ к диалогу («все видят всё»).
      if (tpl.assigneeIds.length) {
        await service
          .from("task_assignees")
          .upsert(
            tpl.assigneeIds.map((pid) => ({
              thread_id: created.threadId,
              participant_id: pid,
            })),
            { onConflict: "thread_id,participant_id", ignoreDuplicates: true },
          );
      } else {
        await addResponsibleMembers(
          threadId,
          ctx.workspaceId,
          config.responsible_user_ids ?? [],
        );
      }
      // Приветствие — только при первом контакте (у победителя создания).
      if (config.welcome_message) {
        await sendMessage(clientTgUserId, config.welcome_message);
      }
    }
  }

  // threadId выставлен во всех ветках выше; guard для типа.
  if (!threadId) return;

  // @username в карточку контакта (зеркало Business/MTProto). Валидируем формат
  // Telegram-username ([A-Za-z0-9_]) перед подстановкой в PostgREST-.or-фильтр.
  if (clientUsername && /^[A-Za-z0-9_]{1,32}$/.test(clientUsername)) {
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

  // Participant отправителя (создан createDirectThread при новом треде).
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
