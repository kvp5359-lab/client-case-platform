/**
 * Сохраняет реакции из Telegram в нашу таблицу message_reactions.
 *
 * Используется и обычным групповым webhook'ом (`telegram-webhook`), и
 * Business-webhook'ом (`telegram-business-webhook`) — логика поиска
 * исходного сообщения и хранения реакций общая, потому что таблица
 * `message_reactions` не различает источник.
 *
 * Алгоритм:
 *  1. Ищем исходное сообщение в project_messages по
 *     (telegram_chat_id, telegram_message_ids[] contains tg_msg_id).
 *     Используем массив, потому что одно «логическое» project_messages
 *     может соответствовать нескольким TG-сообщениям (текст + файлы).
 *  2. Если нашли — сносим прежние реакции этого юзера на это конкретное
 *     TG-сообщение (по telegram_source_message_id), чтобы не затереть
 *     реакции на соседние элементы баббла.
 *  3. Вставляем новые реакции (по одной строке на каждый emoji).
 *
 * `participant_id` — необязательный, используется когда мы можем смапить
 * Telegram-юзера на participant в воркспейсе (по `participants.telegram_user_id`).
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

interface TgReactionType {
  type: "emoji" | "custom_emoji" | "paid";
  emoji?: string;
  custom_emoji_id?: string;
}

interface TgUserMinimal {
  id?: number;
  first_name?: string;
  last_name?: string;
}

export interface TgMessageReactionUpdate {
  chat: { id: number };
  message_id: number;
  user?: TgUserMinimal;
  date?: number;
  old_reaction?: TgReactionType[];
  new_reaction?: TgReactionType[];
  /** Заполнен у Business-обновлений; в обычных группах — undefined. */
  business_connection_id?: string;
}

export async function syncTelegramReactions(
  service: SupabaseClient,
  reaction: TgMessageReactionUpdate,
): Promise<void> {
  const chatId = reaction.chat.id;
  const telegramMessageId = reaction.message_id;
  const telegramUserId = reaction.user?.id;
  if (!telegramUserId) return;

  const telegramUserName =
    [reaction.user?.first_name, reaction.user?.last_name].filter(Boolean).join(" ") ||
    "Telegram User";

  const { data: msg } = await service
    .from("project_messages")
    .select("id, workspace_id")
    .eq("telegram_chat_id", chatId)
    .contains("telegram_message_ids", [telegramMessageId])
    .maybeSingle();
  if (!msg) return;

  // Маппинг tg-юзера в participant'а (если он есть в воркспейсе).
  let participantId: string | null = null;
  const { data: participant } = await service
    .from("participants")
    .select("id")
    .eq("workspace_id", msg.workspace_id)
    .eq("telegram_user_id", telegramUserId)
    .eq("is_deleted", false)
    .maybeSingle();
  if (participant) participantId = participant.id as string;

  // Сносим прежние реакции этого юзера на ЭТО конкретное TG-сообщение.
  await service
    .from("message_reactions")
    .delete()
    .eq("message_id", msg.id)
    .eq("telegram_user_id", telegramUserId)
    .eq("telegram_source_message_id", telegramMessageId);

  const newEmojis = (reaction.new_reaction ?? [])
    .filter((r) => r.type === "emoji" && r.emoji)
    .map((r) => r.emoji!) as string[];
  if (newEmojis.length === 0) return;

  const rows = newEmojis.map((emoji) => ({
    message_id: msg.id,
    participant_id: participantId,
    telegram_user_id: telegramUserId,
    telegram_user_name: telegramUserName,
    emoji,
    telegram_source_message_id: telegramMessageId,
  }));

  const { error } = await service.from("message_reactions").insert(rows);
  if (error) {
    console.error("[syncTelegramReactions] insert error:", error);
  }
}

interface TgReactionCountItem {
  type: TgReactionType;
  total_count: number;
}

interface TgMessageReactionCountUpdate {
  chat: { id: number };
  message_id: number;
  date?: number;
  reactions: TgReactionCountItem[];
}

/**
 * Aggregated reaction update — приходит, когда юзеры анонимны (админ
 * с anonymous=true, мульти-реакции Premium-юзера, реакции в каналах и т.п.)
 * либо когда Telegram решил не раскрывать конкретного юзера. User info нет,
 * только эмодзи и общий count.
 *
 * Стратегия: сводим к простому состоянию «есть N реакций такого-то эмодзи»
 * без участника. На фронте отображаются в общем счётчике; для удаления
 * пользователь сам ставит/снимает свою реакцию.
 */
export async function syncTelegramReactionsAggregated(
  service: SupabaseClient,
  update: TgMessageReactionCountUpdate,
): Promise<void> {
  const chatId = update.chat.id;
  const telegramMessageId = update.message_id;

  const { data: msg } = await service
    .from("project_messages")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .contains("telegram_message_ids", [telegramMessageId])
    .maybeSingle();
  if (!msg) return;

  // Сносим прежние анонимные строки для этого TG-msg, чтобы не плодить дубли.
  await service
    .from("message_reactions")
    .delete()
    .eq("message_id", msg.id)
    .eq("telegram_source_message_id", telegramMessageId)
    .is("telegram_user_id", null);

  const rows = (update.reactions ?? [])
    .filter((r) => r.type.type === "emoji" && r.type.emoji && r.total_count > 0)
    .flatMap((r) =>
      // Один total_count → один ряд (без user info). UI отрисует это как
      // обычную реакцию с tg_user_name="Telegram"; для нескольких — multiplier.
      Array.from({ length: r.total_count }, () => ({
        message_id: msg.id,
        participant_id: null,
        telegram_user_id: null,
        telegram_user_name: "Telegram",
        emoji: r.type.emoji!,
        telegram_source_message_id: telegramMessageId,
      })),
    );

  if (rows.length === 0) return;

  const { error } = await service.from("message_reactions").insert(rows);
  if (error) {
    console.error("[syncTelegramReactionsAggregated] insert error:", error);
  }
}
