/**
 * Обработчик низкоуровневых апдейтов (Raw events) от Telegram MTProto.
 *
 * Используем для тех событий, которым нет high-level wrapper'а в gramjs:
 *  - UpdateMessageReactions / UpdateBotMessageReactions — реакции;
 *  - UpdateReadHistoryOutbox — клиент прочитал наше сообщение;
 *  - UpdateDeleteMessages / UpdateDeleteChannelMessages — удаление;
 *  - UpdateEditMessage / UpdateEditChannelMessage — редактирование.
 *
 * Высокоуровневые EditedMessage/DeletedMessage из gramjs тоже работают,
 * но удобнее разбирать всё в одном месте — Raw сразу даёт типизированный
 * объект.
 */

import { Api } from "telegram"
import { supabase } from "../db.js"
import { logger } from "../utils/logger.js"
import type { SessionContext } from "./types.js"

export async function handleRawUpdate(
  ctx: SessionContext,
  update: Api.TypeUpdate,
): Promise<void> {
  // -----------------------------------------------------------------
  // Реакции в личных чатах: UpdateMessageReactions
  // -----------------------------------------------------------------
  if (update instanceof Api.UpdateMessageReactions) {
    await handleReactionUpdate(ctx, update)
    return
  }

  // -----------------------------------------------------------------
  // Прочитанность: клиент прочитал моё сообщение
  // -----------------------------------------------------------------
  if (update instanceof Api.UpdateReadHistoryOutbox) {
    await handleReadOutbox(ctx, update)
    return
  }

  // -----------------------------------------------------------------
  // Редактирование сообщения
  // -----------------------------------------------------------------
  if (update instanceof Api.UpdateEditMessage) {
    await handleEdit(ctx, update.message)
    return
  }

  // -----------------------------------------------------------------
  // Удаление сообщений (в личке — Update.deleteMessages, без channelId)
  // -----------------------------------------------------------------
  if (update instanceof Api.UpdateDeleteMessages) {
    await handleDelete(ctx, update.messages.map((id) => Number(id)))
    return
  }
}

async function handleReactionUpdate(
  ctx: SessionContext,
  upd: Api.UpdateMessageReactions,
): Promise<void> {
  if (!(upd.peer instanceof Api.PeerUser)) return
  await processReactions(ctx, Number(upd.peer.userId), Number(upd.msgId), upd.reactions)
}

/**
 * Универсальная обработка реакций. Принимает уже распакованные параметры,
 * чтобы можно было звать как из UpdateMessageReactions, так и из
 * UpdateEditMessage (Telegram в личных чатах присылает реакции именно
 * через edit с заполненным полем msg.reactions, а не отдельным апдейтом).
 */
async function processReactions(
  ctx: SessionContext,
  clientTgUserId: number,
  telegramMessageId: number,
  reactions: Api.TypeMessageReactions | undefined,
): Promise<void> {

  // Находим наше сообщение по (thread_id, telegram_message_id). thread
  // ищем через session_user_id + client_tg_user_id, потому что один
  // сотрудник может вести много личных диалогов.
  const { data: thread } = await supabase
    .from("project_threads")
    .select("id")
    .eq("mtproto_session_user_id", ctx.user_id)
    .eq("mtproto_client_tg_user_id", clientTgUserId)
    .eq("is_deleted", false)
    .maybeSingle()
  if (!thread) return

  const { data: msg } = await supabase
    .from("project_messages")
    .select("id, workspace_id")
    .eq("thread_id", thread.id)
    .eq("telegram_message_id", telegramMessageId)
    .maybeSingle()
  if (!msg) return

  // reactions — Api.MessageReactions с recentReactions: список последних
  // авторов и их эмодзи. Полный список реакций — в .results (с количеством),
  // но без авторов. Для UI нам нужны и авторы, и эмодзи — берём из recent.
  const recent = (reactions as Api.MessageReactions | undefined)?.recentReactions ?? []

  // Собираем все эмодзи каждого PeerUser. Нашему собеседнику в личке
  // соответствует только один PeerUser — клиент.
  const byUser = new Map<number, string[]>()
  for (const rr of recent) {
    if (!(rr.peerId instanceof Api.PeerUser)) continue
    if (!(rr.reaction instanceof Api.ReactionEmoji)) continue
    const uid = Number(rr.peerId.userId)
    const arr = byUser.get(uid) ?? []
    arr.push(rr.reaction.emoticon)
    byUser.set(uid, arr)
  }

  // В личке от клиента может прийти только реакция от него самого, плюс
  // апдейт о моих собственных реакциях, поставленных с другого устройства.
  // Обрабатываем все.
  for (const [tgUserId, emojis] of byUser) {
    // Резолв participant: смотрим в participants по telegram_user_id в этом
    // воркспейсе. Если есть — берём оттуда имя и id (UI покажет аватар).
    // Если нет — fallback на user_telegram_links и плейсхолдер `tg:<id>`.
    let participantId: string | null = null
    let userName = `tg:${tgUserId}`
    const { data: participant } = await supabase
      .from("participants")
      .select("id, name, last_name")
      .eq("workspace_id", msg.workspace_id)
      .eq("telegram_user_id", tgUserId)
      .eq("is_deleted", false)
      .maybeSingle()
    if (participant) {
      participantId = participant.id as string
      userName =
        [participant.name, participant.last_name].filter(Boolean).join(" ") ||
        userName
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: link } = await (supabase as any)
          .from("user_telegram_links")
          .select("tg_first_name, tg_last_name, tg_username")
          .eq("tg_user_id", tgUserId)
          .maybeSingle()
        if (link) {
          userName =
            [link.tg_first_name, link.tg_last_name].filter(Boolean).join(" ") ||
            (link.tg_username ? `@${link.tg_username}` : userName)
        }
      } catch {
        /* noop */
      }
    }

    // Сначала чистим прежние реакции этого юзера на это сообщение.
    await supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", msg.id)
      .eq("telegram_user_id", tgUserId)
      .eq("telegram_source_message_id", telegramMessageId)

    if (emojis.length === 0) continue

    const rows = emojis.map((emoji) => ({
      message_id: msg.id,
      participant_id: participantId,
      telegram_user_id: tgUserId,
      telegram_user_name: userName,
      emoji,
      telegram_source_message_id: telegramMessageId,
    }))

    const { error } = await supabase.from("message_reactions").insert(rows)
    if (error) {
      logger.error("[reactions] insert error:", error)
    }
  }
}

async function handleReadOutbox(
  ctx: SessionContext,
  upd: Api.UpdateReadHistoryOutbox,
): Promise<void> {
  const peer = upd.peer
  if (!(peer instanceof Api.PeerUser)) return
  const clientTgUserId = Number(peer.userId)
  const maxReadId = Number(upd.maxId)

  const { data: thread } = await supabase
    .from("project_threads")
    .select("id")
    .eq("mtproto_session_user_id", ctx.user_id)
    .eq("mtproto_client_tg_user_id", clientTgUserId)
    .eq("is_deleted", false)
    .maybeSingle()
  if (!thread) return

  // Помечаем все наши исходящие до maxReadId как прочитанные.
  await supabase
    .from("project_messages")
    .update({ recipient_read_at: new Date().toISOString() })
    .eq("thread_id", thread.id)
    .lte("telegram_message_id", maxReadId)
    .is("recipient_read_at", null)
    // recipient_read_at имеет смысл только для исходящих — у входящих
    // он остаётся NULL. Sender_role NULL = исходящие у нас, либо нет
    // привязки к channel.
    .or("sender_role.is.null,sender_role.eq.Администратор,sender_role.eq.Сотрудник")
}

async function handleEdit(
  ctx: SessionContext,
  msg: Api.TypeMessage,
): Promise<void> {
  if (!(msg instanceof Api.Message)) return
  const peer = msg.peerId
  if (!(peer instanceof Api.PeerUser)) return
  const telegramMessageId = Number(msg.id)
  const clientTgUserId = Number(peer.userId)

  // Telegram в личных чатах присылает изменение реакций как UpdateEditMessage
  // (а не отдельный UpdateMessageReactions). Если в edit пришли реакции —
  // обрабатываем их через общий путь.
  if (msg.reactions) {
    await processReactions(ctx, clientTgUserId, telegramMessageId, msg.reactions)
  }

  // СВОЁ исходящее (out): НЕ применяем plain-текст из эхо-правки. Когда
  // сотрудник редактирует своё сообщение из ЛК, актуальный HTML-контент (вкл.
  // цитаты <blockquote> и форматирование) уже сохранён мутацией editMessage.
  // Telegram отдаёт в эхо только plain `msg.message` без HTML — его запись
  // СХЛОПНУЛА БЫ blockquote/разметку в голый текст (баг 2026-06-25: цитаты в
  // отредактированном исходящем превращались в обычные строки). Реакции на
  // наше сообщение обработаны выше. Цена: правку своего сообщения, сделанную
  // прямо в приложении Telegram (не из ЛК), мы не подхватим — редкий случай.
  if (msg.out === true) return

  // Telegram присылает edit и при настоящем редактировании текста, и при
  // изменении реакций / служебной мета (например, после доставки медиа).
  // Помечаем is_edited только если в апдейте есть НЕпустой текст и он
  // реально поменялся. Пустой msg.message у медиа-сообщений = caption нет,
  // оригинал в БД ("📎" или текст пользователя) трогать нельзя.
  if (!msg.message) return
  const { data: existing } = await supabase
    .from("project_messages")
    .select("id, content")
    .eq("telegram_chat_id", clientTgUserId)
    .contains("telegram_message_ids", [telegramMessageId])
    .maybeSingle()
  if (existing && existing.content !== msg.message) {
    await supabase
      .from("project_messages")
      .update({ content: msg.message, is_edited: true })
      .eq("id", existing.id)
  }
}

async function handleDelete(
  ctx: SessionContext,
  telegramMessageIds: number[],
): Promise<void> {
  if (telegramMessageIds.length === 0) return
  // У UpdateDeleteMessages нет peer — Telegram присылает только id'шники.
  // Нам нужно найти все наши треды этого сотрудника и в них поискать
  // эти message_id.
  const { data: threads } = await supabase
    .from("project_threads")
    .select("id")
    .eq("mtproto_session_user_id", ctx.user_id)
    .eq("is_deleted", false)
  const threadIds = (threads ?? []).map((t) => t.id as string)
  if (threadIds.length === 0) return

  // Soft-delete: НЕ стираем строку физически (иначе потеря переписки навсегда,
  // в т.ч. когда клиент удалил сообщение "только у себя" — у нас нет способа
  // отличить это от "удалить у всех"). Помечаем is_deleted=true — в ленте
  // сообщение остаётся плашкой «Сообщение удалено» с возможностью раскрыть текст.
  await supabase
    .from("project_messages")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .in("thread_id", threadIds)
    .in("telegram_message_id", telegramMessageIds)
    .eq("is_deleted", false)
}
