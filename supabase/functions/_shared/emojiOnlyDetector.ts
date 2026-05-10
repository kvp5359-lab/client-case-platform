/**
 * Детектор «сообщение состоит только из эмодзи».
 *
 * Используется в Telegram Business для эвристической конверсии reply-сообщений
 * с одним эмодзи в реакцию: Bot API не отдаёт нативные reactions для 1-на-1
 * Business-чатов, но Telegram-клиент при тапе на reaction шлёт такое сообщение
 * как обычный reply с эмодзи в content. Если оно реплай на наше сообщение и
 * текст состоит только из эмодзи — почти наверняка это реакция.
 *
 * Допускаются: emoji presentation, emoji modifiers (skin tone), ZWJ-секвенции
 * (семейство 👨‍👩‍👧, профессии 👨‍💻 и т.п.), variation selectors. Запрещены
 * любые буквы, цифры, пробелы (кроме trim'а краёв) и пунктуация.
 *
 * Лимит: 1-3 видимых эмодзи. Это покрывает реальные UX-паттерны реакций
 * («❤️», «👍👍», «🎉🎉🎉»). Если клиент шлёт длинный смайлик-вандал — не
 * считаем за реакцию, попадает в обычные сообщения.
 */

/** Видимый «emoji-кластер» = базовое эмодзи + опциональные модификаторы/ZWJ-секвенции. */
const EMOJI_CLUSTER = /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|️|‍\p{Extended_Pictographic}(?:\p{Emoji_Modifier})?|️)*/u;

const EMOJI_ONLY = new RegExp(`^(?:${EMOJI_CLUSTER.source})(?:${EMOJI_CLUSTER.source}){0,2}$`, "u");

export function isEmojiOnlyContent(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Длина в codepoint'ах (а не байтах) — для оценки минимум одно/максимум
  // несколько эмодзи. Длинные сообщения сразу отметаем без regex.
  const codepointCount = [...trimmed].length;
  if (codepointCount < 1 || codepointCount > 24) return false;
  return EMOJI_ONLY.test(trimmed);
}

/** Возвращает первый emoji-кластер из строки (для нормализации). */
export function extractFirstEmoji(raw: string): string | null {
  const trimmed = raw.trim();
  const match = trimmed.match(EMOJI_CLUSTER);
  return match ? match[0] : null;
}
