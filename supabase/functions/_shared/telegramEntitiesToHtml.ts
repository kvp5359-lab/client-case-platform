/**
 * Конвертация Telegram entities в HTML
 * Telegram entities — массив объектов с offset, length, type
 */

interface TelegramEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
}

/**
 * Конвертирует Telegram text + entities в HTML
 * Если entities нет — возвращает plain text (без обёрток)
 */
export function telegramEntitiesToHtml(
  text: string,
  entities?: TelegramEntity[],
): string {
  if (!entities || entities.length === 0) {
    return text;
  }

  // Telegram считает offset/length в UTF-16 code units
  // Конвертируем в массив code points для корректной работы с emoji
  const codeUnits = stringToUtf16Array(text);

  // Карта: позиция → открывающие/закрывающие теги
  const openTags = new Map<number, string[]>();
  const closeTags = new Map<number, string[]>();

  for (const entity of entities) {
    const tag = entityToTag(entity);
    if (!tag) continue;

    const openList = openTags.get(entity.offset) ?? [];
    openList.push(tag.open);
    openTags.set(entity.offset, openList);

    const closeList = closeTags.get(entity.offset + entity.length) ?? [];
    // unshift для правильного порядка закрытия (LIFO)
    closeList.unshift(tag.close);
    closeTags.set(entity.offset + entity.length, closeList);
  }

  // Собираем результат
  let result = "";
  for (let i = 0; i <= codeUnits.length; i++) {
    if (closeTags.has(i)) result += closeTags.get(i)!.join("");
    if (openTags.has(i)) result += openTags.get(i)!.join("");
    if (i < codeUnits.length) {
      const ch = codeUnits[i];
      result += escapeChar(ch);
    }
  }

  return result;
}

function entityToTag(
  entity: TelegramEntity,
): { open: string; close: string } | null {
  switch (entity.type) {
    case "bold":
      return { open: "<b>", close: "</b>" };
    case "italic":
      return { open: "<i>", close: "</i>" };
    case "underline":
      return { open: "<u>", close: "</u>" };
    case "strikethrough":
      return { open: "<s>", close: "</s>" };
    case "code":
      return { open: "<code>", close: "</code>" };
    case "pre": {
      const safeLang = entity.language?.replace(/[^a-zA-Z0-9_-]/g, "") ?? "";
      return {
        open: safeLang
          ? `<pre><code class="language-${safeLang}">`
          : "<pre>",
        close: safeLang ? "</code></pre>" : "</pre>",
      };
    }
    case "blockquote":
      return { open: "<blockquote>", close: "</blockquote>" };
    case "text_link": {
      const safeUrl = (entity.url ?? "").replace(/"/g, "&quot;");
      return {
        open: `<a href="${safeUrl}">`,
        close: "</a>",
      };
    }
    default:
      return null;
  }
}

function escapeChar(ch: string): string {
  if (ch === "&") return "&amp;";
  if (ch === "<") return "&lt;";
  if (ch === ">") return "&gt;";
  if (ch === "\n") return "<br>";
  return ch;
}

/**
 * Разбивает строку на массив UTF-16 code units
 * Telegram offset/length считаются в UTF-16 units (суррогатные пары = 2 единицы)
 */
function stringToUtf16Array(str: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // Если это high surrogate и за ним идёт low surrogate — одна пара = один символ, но 2 unit'а
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        // Суррогатная пара: добавляем как 2 отдельных unit'а (Telegram так считает)
        result.push(str[i] + str[i + 1]); // Полный символ для первого unit
        result.push(""); // Пустой placeholder для второго unit
        i++;
        continue;
      }
    }
    result.push(str[i]);
  }
  return result;
}
