/**
 * Конверсия Business-сообщения «короткий emoji-reply» в реакцию.
 *
 * Контекст: Bot API не отдаёт `message_reaction` updates для 1-на-1
 * Business-чатов. Когда клиент жмёт на реакцию у нашего сообщения,
 * Telegram-клиент шлёт это как обычный business_message с reply_to и
 * текстом-эмодзи. Технически отличить «реакция» от «осмысленный reply
 * только эмодзи» нельзя — но реальные пользователи отправляют просто
 * эмодзи в reply на чужое сообщение **именно как реакцию** в 99%
 * случаев. Принимаем этот компромисс.
 *
 * Если ловим такое сообщение — пишем в `message_reactions` и НЕ вставляем
 * в `project_messages` (чтобы не плодить шум в ленте).
 *
 * Записываем `tg_emoji_message_id = telegram_message_id` входящего
 * эмодзи-сообщения. Это позволяет позже:
 *   - удалить реакцию, если клиент удалит своё эмодзи-сообщение
 *     (deleted_business_messages обработчик).
 *   - не путать с реакциями того же юзера на другие наши сообщения.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { isEmojiOnlyContent, extractFirstEmoji } from "./emojiOnlyDetector.ts";

interface TgMessageMinimal {
  message_id: number;
  chat: { id: number };
  from?: { id?: number; first_name?: string; last_name?: string };
  text?: string;
  caption?: string;
  reply_to_message?: { message_id: number };
}

export interface ReactionSyncOutcome {
  /** Сообщение действительно было обработано как реакция (и не должно идти в обычный flow). */
  consumed: boolean;
}

/**
 * Если входящий business_message — это эмодзи-only reply на наше
 * сообщение, конвертируем в запись в `message_reactions` и возвращаем
 * `consumed=true`. Иначе ничего не делаем и возвращаем `consumed=false`.
 *
 * @param projectId — id проекта, в котором живёт тред (нужен для поиска
 *   исходного сообщения по составному ключу).
 */
export async function maybeSyncBusinessEmojiReaction(
  service: SupabaseClient,
  args: {
    msg: TgMessageMinimal;
    projectId: string;
    workspaceId: string;
  },
): Promise<ReactionSyncOutcome> {
  const { msg, projectId, workspaceId } = args;
  const replyToTgId = msg.reply_to_message?.message_id;
  if (!replyToTgId) return { consumed: false };

  const content = (msg.text ?? msg.caption ?? "").trim();
  if (!isEmojiOnlyContent(content)) return { consumed: false };

  const emoji = extractFirstEmoji(content);
  if (!emoji) return { consumed: false };

  // Ищем исходное сообщение, на которое отвечает клиент. Реплай в Business
  // ВСЕГДА на сообщения внутри этого треда; искать достаточно по
  // (project_id, telegram_message_id) с фолбэком в массив telegram_message_ids.
  const { data: parent } = await service
    .from("project_messages")
    .select("id, workspace_id")
    .eq("project_id", projectId)
    .eq("telegram_chat_id", msg.chat.id)
    .or(
      `telegram_message_id.eq.${replyToTgId},telegram_message_ids.cs.{${replyToTgId}}`,
    )
    .maybeSingle();

  if (!parent) {
    // Реплай на сообщение, которое мы не нашли (например, очень старое или
    // внешнее) — оставляем обычный flow, пусть превратится в обычное
    // сообщение в ленте.
    return { consumed: false };
  }

  const telegramUserId = msg.from?.id ?? null;
  const telegramUserName =
    [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || null;

  // Маппинг tg-юзера в participant'а в этом workspace, если есть.
  let participantId: string | null = null;
  if (telegramUserId != null) {
    const { data: participant } = await service
      .from("participants")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("telegram_user_id", telegramUserId)
      .eq("is_deleted", false)
      .maybeSingle();
    if (participant) participantId = participant.id as string;
  }

  // Снимаем прежние «эмодзи-реакции» этого пользователя на этот же parent —
  // чтобы клиент мог сменить реакцию (тапнул на ❤️, потом на 👍 — у нас
  // должна остаться только последняя). Удаляем по telegram_user_id, не
  // по participant_id: клиент может вообще не быть participant'ом в нашем
  // воркспейсе (часто так и есть).
  if (telegramUserId != null) {
    await service
      .from("message_reactions")
      .delete()
      .eq("message_id", parent.id)
      .eq("telegram_user_id", telegramUserId);
  }

  await service.from("message_reactions").insert({
    message_id: parent.id,
    participant_id: participantId,
    emoji,
    telegram_user_id: telegramUserId,
    telegram_user_name: telegramUserName,
    tg_emoji_message_id: msg.message_id,
  });

  return { consumed: true };
}

/**
 * Обработчик `deleted_business_messages`: удаляем строки в
 * `message_reactions`, где `tg_emoji_message_id` входит в удалённый набор
 * (это были эмодзи-реплаи, которые клиент снял в Telegram → у нас должна
 * пропасть и реакция).
 *
 * Сообщения, которые были обычными (а не реакциями), на этом этапе мы
 * НЕ трогаем — у нас нет soft-delete для входящих в Business, поэтому
 * пусть остаются в ленте (с пометкой «удалено в Telegram» — это уже
 * отдельная задача, в текущем MVP не делаем).
 */
export async function deleteBusinessReactionsByMessageIds(
  service: SupabaseClient,
  telegramMessageIds: number[],
): Promise<void> {
  if (telegramMessageIds.length === 0) return;
  const { error } = await service
    .from("message_reactions")
    .delete()
    .in("tg_emoji_message_id", telegramMessageIds);
  if (error) {
    console.error("[syncBusinessEmojiReaction] delete reactions error:", error);
  }
}
