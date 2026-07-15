/**
 * Лид-бот: приёмник холодных лидов через рекламного бота (mode='lead').
 *
 * Обычный бот, которого рекламируют. Клиент пишет ему в личку → создаётся
 * личный диалог (project_id=NULL) с меткой кампании. Доступ к диалогу («все
 * видят всё») даёт назначение команды, и путей два:
 *  • задан config.template_id → эффективные исполнители из общей функции
 *    применения (шаблон + переопределения этого бота) идут в task_assignees;
 *  • шаблона нет (легаси-бот) → config.responsible_user_ids идут в участники
 *    треда (project_thread_members).
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
import { htmlToTelegramHtml } from "../_shared/htmlFormatting.ts";
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

/** Поля треда из шаблона диалога, применяемые к новому лид-диалогу. */
interface LeadTemplateApply {
  icon?: string;
  accentColor?: string;
  /** Доп. колонки треда (status_id, deadline, access_type, access_roles). */
  extraColumns: Record<string, unknown>;
  /** participant_id[] исполнителей → task_assignees. */
  assigneeIds: string[];
  /** Первое сообщение шаблона — приветствие клиенту (HTML). */
  welcomeHtml?: string;
}

/** Эффективные поля шаблона (после folding «переопределения ?? база»). */
interface ResolvedTemplateFields {
  icon: string | null;
  accent_color: string | null;
  status_id: string | null;
  deadline_days: number | null;
  access_type: string | null;
  access_roles: string[] | null;
  initial_message_html: string | null;
  assignee_ids: string[] | null;
}

/** Раскладывает эффективные поля шаблона в форму для создания треда. */
function toLeadTemplateApply(f: ResolvedTemplateFields): LeadTemplateApply {
  const extraColumns: Record<string, unknown> = {};
  if (f.status_id) extraColumns.status_id = f.status_id;
  if (f.deadline_days != null) {
    extraColumns.deadline = new Date(
      Date.now() + f.deadline_days * 86_400_000,
    ).toISOString();
  }
  if (f.access_type) extraColumns.access_type = f.access_type;
  if (f.access_roles) extraColumns.access_roles = f.access_roles;

  return {
    icon: f.icon ?? undefined,
    accentColor: f.accent_color ?? undefined,
    extraColumns,
    assigneeIds: f.assignee_ids ?? [],
    welcomeHtml: f.initial_message_html ?? undefined,
  };
}

/**
 * Шаблон диалога лид-бота → поля создаваемого треда.
 *
 * Единый механизм «шаблон + переопределения»: у канала есть строка-привязка
 * (project_template_thread_templates с integration_id = бот), в ней живут его
 * переопределения; применение — общая RPC resolve_thread_template_binding
 * (та же, что для проект-шаблонов). Привязки нет (шаблон выбран, но не
 * настраивался) → фолбэк на базовый шаблон как есть.
 *
 * Имя треда берётся по контакту (не из шаблона) — лид-специфика.
 */
/**
 * Владелец диалога по исполнителям шаблона: берём аккаунт первого из них.
 * Исполнители — participants, из которых аккаунт есть не у всех (контакты
 * клиентов), поэтому ищем первого с user_id.
 */
async function resolveOwnerFromAssignees(
  assigneeIds: string[],
): Promise<string | null> {
  if (!assigneeIds.length) return null;
  const { data } = await service
    .from("participants")
    .select("id, user_id")
    .in("id", assigneeIds)
    .not("user_id", "is", null);
  const byId = new Map(
    (data ?? []).map((p) => [p.id as string, p.user_id as string]),
  );
  for (const pid of assigneeIds) {
    const uid = byId.get(pid);
    if (uid) return uid;
  }
  return null;
}

async function resolveLeadTemplate(
  botIntegrationId: string,
  templateId: string | undefined,
): Promise<LeadTemplateApply> {
  const empty: LeadTemplateApply = { extraColumns: {}, assigneeIds: [] };
  if (!templateId) return empty;

  // Общая RPC: сама находит привязку канала и применяет её переопределения,
  // а при отсутствии привязки отдаёт базовый шаблон. Folding-логика живёт
  // ТОЛЬКО в БД — в edge её не дублируем.
  const { data } = await service.rpc("resolve_thread_template_for_integration", {
    p_integration_id: botIntegrationId,
    p_thread_template_id: templateId,
  });
  const r = (Array.isArray(data) ? data[0] : data) as ResolvedTemplateFields | null;
  return r ? toLeadTemplateApply(r) : empty;
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
    // Шаблон диалога (если у бота задан) — иконка/цвет/статус/дедлайн/доступ +
    // исполнители. Иконку/цвет из шаблона кладём в extraColumns, чтобы перебить
    // channel_defaults, которые проставляет createDirectThread.
    const tpl = await resolveLeadTemplate(ctx.id, config.template_id);

    // Новый холодный лид → личный диалог (project_id=NULL).
    // Владелец: явная настройка → первый из легаси-пула → первый исполнитель
    // шаблона. Последнее важно для ботов на шаблоне без «дополнительных
    // исполнителей»: пул в конфиге пуст, и диалог остался бы без владельца.
    const ownerUserId =
      config.owner_user_id ??
      config.responsible_user_ids?.[0] ??
      (await resolveOwnerFromAssignees(tpl.assigneeIds));

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
      // Исполнители (дают доступ к диалогу, «все видят всё»):
      //  • шаблон задан → эффективные исполнители из общей RPC (исполнители
      //    шаблона + дополнительные этого бота — режим extend) → task_assignees;
      //  • шаблона нет → легаси-пул ответственных → участники (project_thread_members).
      if (config.template_id) {
        if (tpl.assigneeIds.length) {
          await service.from("task_assignees").upsert(
            tpl.assigneeIds.map((pid) => ({
              thread_id: created.threadId,
              participant_id: pid,
            })),
            { onConflict: "thread_id,participant_id", ignoreDuplicates: true },
          );
        }
      } else {
        await addResponsibleMembers(
          threadId,
          ctx.workspaceId,
          config.responsible_user_ids ?? [],
        );
      }
      // Приветствие — только при первом контакте (у победителя создания).
      // Источник строго по конфигурации бота, без тихих подмен: есть шаблон →
      // его «первое сообщение» (пусто в шаблоне = приветствия нет); нет шаблона
      // → легаси-поле welcome_message (оно и показано в UI только в этом случае).
      const welcome = config.template_id
        ? (tpl.welcomeHtml ? htmlToTelegramHtml(tpl.welcomeHtml) : undefined)
        : config.welcome_message;
      if (welcome) {
        await sendMessage(clientTgUserId, welcome);
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
