/**
 * Сохраняет входящее Telegram-сообщение в project_messages.
 *
 * Используется и telegram-webhook (v1 + личные боты), и telegram-webhook-v2.
 * Раньше в каждом webhook'е жила своя копия этой логики, и при правке одного
 * мы забывали про другой — отсюда баги вроде «дубликаты в дедупе» и
 * «новые поля не заполняются у v2». Теперь — единая точка.
 *
 * Алгоритм:
 *  1. Нормальные дубликаты (один и тот же бот видит апдейт повторно): ловим
 *     через индекс по (telegram_chat_id, telegram_message_id, integration_id).
 *  2. Кросс-ботовые дубликаты в basic-группах: ловим через UNIQUE INDEX
 *     uq_project_messages_telegram_dedup по
 *     (telegram_chat_id, telegram_sender_user_id, telegram_message_date).
 *     INSERT падает с 23505 — догоняем UPDATE'ом, но **только** на полях,
 *     которые ещё не заполнены (`.is(...null)`), чтобы не затереть данные
 *     первого вставщика.
 *  3. Reply lookup идёт в counter того бота, который получил апдейт:
 *     для личного бота — по integration_id; для секретаря — по `is null`.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface TgFrom {
  id?: number;
  first_name?: string;
  last_name?: string;
}

interface TgFileRef {
  file_unique_id?: string;
}

interface TgMessageMinimal {
  message_id: number;
  chat: { id: number };
  date?: number;
  from?: TgFrom;
  reply_to_message?: { message_id: number; date?: number };
  // Поля вложений — нужны для извлечения file_unique_id в дедуп-ключ.
  // Все опциональные: одно сообщение содержит ровно один из этих типов
  // (TG не миксует фото и документ в одном message).
  document?: TgFileRef;
  photo?: TgFileRef[]; // массив размеров; берём последний (самый большой)
  video?: TgFileRef;
  audio?: TgFileRef;
  voice?: TgFileRef;
  video_note?: TgFileRef;
  animation?: TgFileRef & { mime_type?: string };
  /** Стикер: для UI берём emoji (если есть) для понятного content-описания. */
  sticker?: TgFileRef & { emoji?: string };
}

/**
 * Извлекает стабильный TG-id первого вложения сообщения. Этот id одинаков
 * у разных ботов для одного и того же файла (нужен multi-bot dedup) и
 * разный для разных файлов (даёт различить файлы, отправленные одной
 * секундой одним юзером).
 */
function extractFileUniqueId(message: TgMessageMinimal): string | null {
  if (message.document?.file_unique_id) return message.document.file_unique_id;
  if (message.photo && message.photo.length > 0) {
    // Берём последний (самый большой) размер.
    const last = message.photo[message.photo.length - 1];
    if (last?.file_unique_id) return last.file_unique_id;
  }
  if (message.video?.file_unique_id) return message.video.file_unique_id;
  if (message.audio?.file_unique_id) return message.audio.file_unique_id;
  if (message.voice?.file_unique_id) return message.voice.file_unique_id;
  if (message.video_note?.file_unique_id) return message.video_note.file_unique_id;
  if (message.animation?.file_unique_id) return message.animation.file_unique_id;
  if (message.sticker?.file_unique_id) return message.sticker.file_unique_id;
  return null;
}

export interface ChatBinding {
  project_id: string;
  workspace_id: string;
  channel: string | null;
  thread_id: string | null;
}

export interface PersonalBotContext {
  integrationId: string;
  workspaceId: string;
  botId: number | null;
}

interface ForwardInfo {
  name: string | null;
  date: string | null;
}

export interface SyncResult {
  /** id вставленной/найденной строки в project_messages, если удалось получить */
  rowId: string | null;
  /** Что произошло: insert / merge / no-op */
  outcome: "inserted" | "enriched" | "duplicate" | "error";
  error?: unknown;
}

/**
 * Возвращает id строки project_messages, в которую попало сообщение,
 * либо null если что-то пошло не так. Вызывающий webhook сам решает,
 * что делать дальше (например, скачать вложения, если outcome='inserted').
 */
export async function syncTelegramIncomingMessage(
  service: SupabaseClient,
  args: {
    message: TgMessageMinimal;
    binding: ChatBinding;
    /** HTML-форматированный текст сообщения (после telegramEntitiesToHtml). */
    text: string;
    /** Имя отправителя для показа в UI. */
    senderName: string;
    /** Уже найденный/созданный participant_id отправителя в этом workspace. */
    senderParticipantId: string | null;
    /** Информация о пересланности (forwarded_from_name, forwarded_date). */
    forwardInfo: ForwardInfo;
    /** Контекст личного бота, если webhook его обрабатывает. null = секретарь. */
    asPersonalBot: PersonalBotContext | null;
    /**
     * Источник для project_messages.source. Default 'telegram'. Для
     * Business-webhook передаётся 'telegram_business' — это нужно, чтобы
     * исходящий триггер notify_telegram_on_new_message не зацикливался
     * (он реагирует на свой источник иначе).
     */
    source?: "telegram" | "telegram_business";
    /** Роль отправителя в UI. Default 'Telegram'. Для Business-клиента — 'Клиент'. */
    senderRole?: string | null;
  },
): Promise<SyncResult> {
  const {
    message,
    binding,
    text,
    senderName,
    senderParticipantId,
    forwardInfo,
    asPersonalBot,
    source = "telegram",
    senderRole = "Telegram",
  } = args;

  const chatId = message.chat.id;
  const telegramMessageId = message.message_id;
  const replyToTgMsgId = message.reply_to_message?.message_id ?? null;
  const telegramUserId = message.from?.id ?? null;
  const messageDateISO = message.date
    ? new Date(message.date * 1000).toISOString()
    : null;
  const fileUniqueId = extractFileUniqueId(message);

  // Lookup исходника реплая в counter того же бота.
  let replyToDbId: string | null = null;
  if (replyToTgMsgId) {
    let q = service
      .from("project_messages")
      .select("id")
      .eq("project_id", binding.project_id)
      .eq("telegram_message_id", replyToTgMsgId);
    q = asPersonalBot
      ? q.eq("telegram_bot_integration_id", asPersonalBot.integrationId)
      : q.is("telegram_bot_integration_id", null);
    const { data: replyMsg } = await q.maybeSingle();
    replyToDbId = replyMsg?.id ?? null;
  }

  // Фолбэк для multi-bot групп: оригинал мог быть отправлен ДРУГИМ ботом,
  // тогда reply_to_message.message_id (нумерация бота, поймавшего реплай)
  // не совпадёт с записанным telegram_message_id оригинала. Дата сообщения
  // бот-независима → матчим оригинал по (chat_id + date). Включается только
  // когда основной поиск дал null — рабочие single-bot случаи не трогаем.
  if (!replyToDbId && message.reply_to_message?.date) {
    const replyDateISO = new Date(
      message.reply_to_message.date * 1000,
    ).toISOString();
    const { data: replyByDate } = await service
      .from("project_messages")
      .select("id")
      .eq("project_id", binding.project_id)
      .eq("telegram_chat_id", chatId)
      .eq("telegram_message_date", replyDateISO)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    replyToDbId = replyByDate?.id ?? null;
  }

  // Подбираем человекочитаемое описание для медиа без caption.
  // Раньше для всего (фото, документ, стикер, GIF) ставили "📎" — пользователь
  // не отличал «клиент прислал документ, который не загрузился» от «клиент
  // прислал стикер 😄 для эмоции». Теперь стикеры и анимации помечаются явно.
  const fallbackContent = (() => {
    if (message.sticker) {
      const emoji = message.sticker.emoji;
      return emoji ? `🟪 Стикер ${emoji}` : "🟪 Стикер";
    }
    if (message.animation) return "🎞 GIF";
    return "📎";
  })();

  const insertPayload = {
    project_id: binding.project_id,
    workspace_id: binding.workspace_id,
    sender_participant_id: senderParticipantId,
    sender_name: senderName,
    sender_role: senderRole,
    content: text || fallbackContent,
    source,
    channel: binding.channel || "client",
    thread_id: binding.thread_id ?? undefined,
    telegram_message_id: telegramMessageId,
    telegram_message_ids: [telegramMessageId],
    telegram_chat_id: chatId,
    telegram_sender_user_id: telegramUserId,
    telegram_message_date: messageDateISO,
    reply_to_message_id: replyToDbId,
    forwarded_from_name: forwardInfo.name,
    forwarded_date: forwardInfo.date,
    telegram_bot_integration_id: asPersonalBot?.integrationId ?? null,
    telegram_file_unique_id: fileUniqueId,
  };

  const insertResult = await service
    .from("project_messages")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insertResult.data) {
    return { rowId: insertResult.data.id as string, outcome: "inserted" };
  }

  // 23505 = unique violation на uq_project_messages_telegram_dedup.
  // Другой webhook (секретарь или личный бот, в зависимости от того,
  // кто пришёл первым) уже вставил эту строку. Догоним.
  const isUniqueViolation =
    typeof insertResult.error?.code === "string" && insertResult.error.code === "23505";
  if (
    isUniqueViolation &&
    telegramUserId != null &&
    messageDateISO &&
    asPersonalBot
  ) {
    // Только личный бот «дописывает» секретарскую строку: добавляет
    // integration_id, message_id из своего counter (для последующих
    // edit/delete) и reply_to_message_id (если у секретаря не было).
    // Условие `.is(integration_id, null)` оберегает от перезаписи случая,
    // когда личный бот пришёл первым — тогда секретарь не должен ничего
    // обновлять.
    const enrich: Record<string, unknown> = {
      telegram_bot_integration_id: asPersonalBot.integrationId,
    };
    if (telegramMessageId) enrich.telegram_message_id = telegramMessageId;
    if (replyToDbId) enrich.reply_to_message_id = replyToDbId;

    // Дополнительно копим оба message_id в массив — пригодится, если позже
    // какой-то другой бот пришлёт edit/delete с другим counter id.
    // Атомарность не нужна: array_append через RPC слишком тяжело,
    // поэтому читаем-обновляем (узкое окно гонки приемлемо в этом сценарии).
    // При multi-file в одну секунду в БД может оказаться несколько строк
    // с одинаковыми (chat, sender, date) — отличающиеся file_unique_id.
    // Чтобы enrich попал ровно в «нашу» — фильтруем дополнительно по file id.
    let lookup = service
      .from("project_messages")
      .select("id, telegram_message_ids")
      .eq("telegram_chat_id", chatId)
      .eq("telegram_sender_user_id", telegramUserId)
      .eq("telegram_message_date", messageDateISO);
    lookup = fileUniqueId
      ? lookup.eq("telegram_file_unique_id", fileUniqueId)
      : lookup.is("telegram_file_unique_id", null);
    const { data: existing } = await lookup.limit(1).maybeSingle();
    if (existing) {
      const ids = (existing.telegram_message_ids as number[] | null) ?? [];
      if (!ids.includes(telegramMessageId)) {
        enrich.telegram_message_ids = [...ids, telegramMessageId];
      }
    }

    let upd = service
      .from("project_messages")
      .update(enrich)
      .eq("telegram_chat_id", chatId)
      .eq("telegram_sender_user_id", telegramUserId)
      .eq("telegram_message_date", messageDateISO)
      .is("telegram_bot_integration_id", null);
    upd = fileUniqueId
      ? upd.eq("telegram_file_unique_id", fileUniqueId)
      : upd.is("telegram_file_unique_id", null);
    await upd;

    return { rowId: existing?.id ?? null, outcome: "enriched" };
  }

  if (isUniqueViolation) {
    // Секретарь увидел сообщение, которое личный бот уже вставил с
    // integration_id. Просто пропускаем — данные у личного бота полнее.
    return { rowId: null, outcome: "duplicate" };
  }

  return { rowId: null, outcome: "error", error: insertResult.error };
}

/**
 * Edit входящего сообщения.
 *
 * Telegram присылает edited_message в counter того бота, который получил
 * событие. Чтобы найти исходную строку:
 *  - Сначала ищем по integration_id (если webhook личного бота).
 *  - Иначе — по `is null` (секретарь).
 *  - Если не нашли (возможно, строка была "пере-стамплена" другим ботом),
 *    fallback по массиву telegram_message_ids[] через `cs` (contains).
 */
export async function applyTelegramEdit(
  service: SupabaseClient,
  args: {
    chatId: number;
    telegramMessageId: number;
    newContent: string;
    asPersonalBot: PersonalBotContext | null;
  },
): Promise<void> {
  const { chatId, telegramMessageId, newContent, asPersonalBot } = args;

  // Попытка 1: по telegram_message_id с учётом integration_id.
  let upd = service
    .from("project_messages")
    .update({ content: newContent, is_edited: true })
    .eq("telegram_message_id", telegramMessageId)
    .eq("telegram_chat_id", chatId);
  upd = asPersonalBot
    ? upd.eq("telegram_bot_integration_id", asPersonalBot.integrationId)
    : upd.is("telegram_bot_integration_id", null);
  const r1 = await upd.select("id");
  if ((r1.data?.length ?? 0) > 0) return;

  // Попытка 2: по массиву telegram_message_ids[] (cross-bot edit на
  // строку, которую другой бот стампил позже). Здесь не ограничиваем
  // integration_id — ищем любое попадание ID в массиве этого чата.
  await service
    .from("project_messages")
    .update({ content: newContent, is_edited: true })
    .eq("telegram_chat_id", chatId)
    .contains("telegram_message_ids", [telegramMessageId]);
}
