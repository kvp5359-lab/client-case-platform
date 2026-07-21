/**
 * Сохраняет реакции из Telegram в нашу таблицу message_reactions.
 *
 * Используется и групповым webhook'ом (`telegram-webhook-v2`), и
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

  // Берём САМУЮ СВЕЖУЮ запись с этим tg_message_id: в basic-группах
  // message_id может переиспользоваться (мы видели коллизии в DB), а реакция
  // всегда относится к последнему сообщению с этим id. .maybeSingle() ронял
  // тихую ошибку при multiple matches → реакция терялась.
  const { data: msgs } = await service
    .from("project_messages")
    .select("id, workspace_id")
    .eq("telegram_chat_id", chatId)
    .contains("telegram_message_ids", [telegramMessageId])
    .order("created_at", { ascending: false })
    .limit(1);
  const msg = msgs && msgs.length > 0 ? msgs[0] : null;
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

  const newEmojis = (reaction.new_reaction ?? [])
    .filter((r) => r.type === "emoji" && r.emoji)
    .map((r) => r.emoji!) as string[];

  // 🔴 ИДЕМПОТЕНТНАЯ СВЕРКА (не «снести всё + вставить заново»).
  // Telegram переприсылает одно и то же обновление реакции (при любом изменении
  // набора реакций на сообщении, при повторной доставке и — особенно — когда в
  // группе несколько ботов: каждый бот получает копию события). Прежний
  // DELETE+INSERT пересоздавал строку с `created_at = now()`, и это время
  // прыгало вперёд ЗА момент «Прочитано» → тред снова становился непрочитанным
  // из-за той же реакции. Теперь трогаем только реально изменившееся: снимаем
  // исчезнувшие эмодзи, вставляем новые, а у оставшихся `created_at` сохраняется.
  const { data: existing } = await service
    .from("message_reactions")
    .select("id, emoji")
    .eq("message_id", msg.id)
    .eq("telegram_user_id", telegramUserId)
    .eq("telegram_source_message_id", telegramMessageId);

  const existingEmojis = new Set((existing ?? []).map((r) => r.emoji as string));
  const desiredEmojis = new Set(newEmojis);

  // Снять только реакции, которых больше нет (в т.ч. пустой new_reaction = снять все).
  const toDeleteIds = (existing ?? [])
    .filter((r) => !desiredEmojis.has(r.emoji as string))
    .map((r) => r.id as string);
  if (toDeleteIds.length > 0) {
    await service.from("message_reactions").delete().in("id", toDeleteIds);
  }

  // Вставить только по-настоящему новые эмодзи (у существующих время не меняем).
  const toInsertEmojis = newEmojis.filter((e) => !existingEmojis.has(e));
  if (toInsertEmojis.length === 0) return;

  const rows = toInsertEmojis.map((emoji) => ({
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

  const { data: msgs } = await service
    .from("project_messages")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .contains("telegram_message_ids", [telegramMessageId])
    .order("created_at", { ascending: false })
    .limit(1);
  const msg = msgs && msgs.length > 0 ? msgs[0] : null;
  if (!msg) return;

  // 🔴 ИДЕМПОТЕНТНАЯ СВЕРКА по КОЛИЧЕСТВУ на эмодзи (не «снести всё + вставить»).
  // Тот же корень, что у per-user пути: DELETE+INSERT переписывал `created_at`
  // на now() → анонимная реакция «молодела» за момент «Прочитано» и воскрешала
  // тред. Теперь для каждого эмодзи доводим число строк до нужного: лишние
  // снимаем, недостающие добавляем, у остающихся `created_at` сохраняется.
  const { data: existing } = await service
    .from("message_reactions")
    .select("id, emoji")
    .eq("message_id", msg.id)
    .eq("telegram_source_message_id", telegramMessageId)
    .is("telegram_user_id", null);

  const desiredCount = new Map<string, number>();
  for (const r of update.reactions ?? []) {
    if (r.type.type === "emoji" && r.type.emoji && r.total_count > 0) {
      desiredCount.set(r.type.emoji, (desiredCount.get(r.type.emoji) ?? 0) + r.total_count);
    }
  }

  const existingByEmoji = new Map<string, string[]>();
  for (const r of existing ?? []) {
    const arr = existingByEmoji.get(r.emoji as string) ?? [];
    arr.push(r.id as string);
    existingByEmoji.set(r.emoji as string, arr);
  }

  const toDeleteIds: string[] = [];
  const rows: Array<Record<string, unknown>> = [];
  const allEmojis = new Set<string>([...desiredCount.keys(), ...existingByEmoji.keys()]);
  for (const emoji of allEmojis) {
    const want = desiredCount.get(emoji) ?? 0;
    const have = existingByEmoji.get(emoji) ?? [];
    if (have.length > want) {
      // Снимаем лишние (у оставшихся `have.slice(0, want)` время не трогаем).
      toDeleteIds.push(...have.slice(want));
    } else if (have.length < want) {
      for (let i = 0; i < want - have.length; i++) {
        rows.push({
          message_id: msg.id,
          participant_id: null,
          telegram_user_id: null,
          telegram_user_name: "Telegram",
          emoji,
          telegram_source_message_id: telegramMessageId,
        });
      }
    }
  }

  if (toDeleteIds.length > 0) {
    await service.from("message_reactions").delete().in("id", toDeleteIds);
  }
  if (rows.length === 0) return;

  const { error } = await service.from("message_reactions").insert(rows);
  if (error) {
    console.error("[syncTelegramReactionsAggregated] insert error:", error);
  }
}
