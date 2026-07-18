/**
 * Утилиты форматирования HTML для Telegram
 * Telegram HTML parse_mode поддерживает: <b>, <i>, <u>, <s>, <code>, <pre>, <blockquote>, <a href="">
 */

/** Проверяет, содержит ли строка HTML-теги */
export function isHtmlContent(content: string): boolean {
  return /<[a-z][\s\S]*?>/i.test(content);
}

/** Экранирует &, <, > для безопасной вставки plain text внутрь HTML */
export function escapeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Индекс закрывающего </tag> для тега, открытого на fromIdx, с учётом
 *  вложенности того же тега (например, <ol> внутри <ol>). */
function findMatchingClose(html: string, fromIdx: number, tag: string): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "ig");
  re.lastIndex = fromIdx;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] === "/") {
      depth--;
      if (depth === 0) return m.index;
    } else {
      depth++;
    }
  }
  return html.length;
}

/** Прямые <li> содержимого списка (вложенные <li> пропускаются). */
function splitDirectListItems(inner: string): string[] {
  const items: string[] = [];
  let pos = 0;
  while (true) {
    const open = inner.slice(pos).match(/<li\b[^>]*>/i);
    if (!open || open.index === undefined) break;
    const start = pos + open.index + open[0].length;
    const close = findMatchingClose(inner, start, "li");
    items.push(inner.slice(start, close));
    pos = close + "</li>".length;
  }
  return items;
}

/**
 * Рекурсивно конвертирует <ol>/<ul> в текст. Нумерованные — иерархически:
 * верхний уровень 1, 2…, вложенные — prefix.N (1.1, 1.2…). Уважает start у <ol>.
 * Telegram не поддерживает <ol>/<ul>/<li>.
 */
function listsToText(html: string, prefix = ""): string {
  let out = "";
  let pos = 0;
  const openRe = /<(ol|ul)\b([^>]*)>/i;
  while (true) {
    const rest = html.slice(pos);
    const m = rest.match(openRe);
    if (!m || m.index === undefined) {
      out += rest;
      break;
    }
    const tag = m[1].toLowerCase();
    const attrs = m[2];
    const openStart = pos + m.index;
    const openEnd = openStart + m[0].length;
    out += html.slice(pos, openStart);
    const closeIdx = findMatchingClose(html, openEnd, tag);
    const inner = html.slice(openEnd, closeIdx);
    out += renderListItems(inner, tag, attrs, prefix);
    pos = closeIdx + `</${tag}>`.length;
  }
  return out;
}

function renderListItems(
  inner: string,
  tag: string,
  attrs: string,
  prefix: string,
): string {
  const items = splitDirectListItems(inner);
  let counter = 0;
  if (tag === "ol") {
    const sm = attrs.match(/\bstart\s*=\s*["']?(\d+)/i);
    counter = sm ? parseInt(sm[1], 10) - 1 : 0;
  }
  let out = "";
  for (const item of items) {
    // Текст пункта — до первого вложенного списка; вложенные — рекурсивно.
    const nestedAt = item.search(/<(ol|ul)\b/i);
    const textPart = nestedAt === -1 ? item : item.slice(0, nestedAt);
    const nestedPart = nestedAt === -1 ? "" : item.slice(nestedAt);
    const text = textPart.replace(/<\/?p\b[^>]*>/gi, "").trim();
    if (tag === "ol") {
      counter++;
      const label = `${prefix}${counter}`;
      out += `${label}. ${text}\n`;
      if (nestedPart) out += listsToText(nestedPart, `${label}.`);
    } else {
      out += `• ${text}\n`;
      if (nestedPart) out += listsToText(nestedPart, prefix);
    }
  }
  return out;
}

/**
 * Конвертирует Tiptap HTML → Telegram-совместимый HTML
 * Telegram поддерживает ограниченный набор тегов, остальные удаляются
 */
export function htmlToTelegramHtml(html: string): string {
  let result = html;

  // <strong> → <b>
  result = result.replace(/<strong>/g, "<b>").replace(/<\/strong>/g, "</b>");
  // <em> → <i>
  result = result.replace(/<em>/g, "<i>").replace(/<\/em>/g, "</i>");

  // Заголовки: Telegram HTML не поддерживает <h1>…<h6>, эмулируем через <b>
  // плюс визуальные отбивки разного уровня.
  result = result.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_m, inner: string) =>
    `\n\n<b>━━━ ${inner.trim()} ━━━</b>\n\n`,
  );
  result = result.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/g, (_m, inner: string) =>
    `\n\n<b>▸ ${inner.trim()}</b>\n\n`,
  );
  result = result.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/g, (_m, inner: string) =>
    `\n\n<b>${inner.trim()}</b>\n\n`,
  );
  result = result.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/g, (_m, inner: string) =>
    `\n\n<b><i>${inner.trim()}</i></b>\n\n`,
  );

  // Списки → текст. Нумерованные — иерархически (1, 1.1, 1.2…), уважают start.
  result = listsToText(result);

  // <blockquote> — Telegram поддерживает, оставляем
  // Пустые параграфы (<p><br></p> или <p></p>) → пустая строка
  result = result.replace(/<p><br\s*\/?><\/p>/g, "\n");
  result = result.replace(/<p><\/p>/g, "\n");
  // <p> → текст + \n
  result = result.replace(/<p>/g, "").replace(/<\/p>/g, "\n");
  // <br> → \n
  result = result.replace(/<br\s*\/?>/g, "\n");
  // Убираем все HTML-теги кроме разрешённых Telegram
  result = result.replace(
    /<(?!\/?(?:b|i|u|s|code|pre|blockquote|a)\b)[^>]*>/g,
    "",
  );
  // &nbsp; → обычный пробел (Tiptap часто вставляет, Telegram не понимает)
  result = result.replace(/&nbsp;/g, " ");
  // Убираем trailing newlines
  result = result.replace(/\n+$/, "");

  return result;
}

/**
 * Конвертирует Tiptap HTML → текст с разметкой WhatsApp.
 * WhatsApp понимает: *жирный*, _курсив_, ~зачёркнутый~, `моно`, ```блок```.
 * Списки → текст с нумерацией (иерархической, уважает start — как в Telegram).
 */
export function htmlToWhatsApp(html: string): string {
  let result = html;

  // Блочный код <pre> → ```…``` (до inline, чтобы не сломать)
  result = result.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, i: string) =>
    "```\n" + i.replace(/<[^>]+>/g, "") + "\n```\n",
  );
  // Inline-форматирование → символы WhatsApp
  result = result.replace(/<\/?(strong|b)\b[^>]*>/gi, "*");
  result = result.replace(/<\/?(em|i)\b[^>]*>/gi, "_");
  result = result.replace(/<\/?(s|del|strike)\b[^>]*>/gi, "~");
  result = result.replace(/<\/?code\b[^>]*>/gi, "`");

  // Заголовки → *жирный* с отбивкой
  result = result.replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, (_m, i: string) =>
    `\n\n*${i.replace(/<[^>]+>/g, "").trim()}*\n\n`,
  );

  // Списки → текст с нумерацией (переиспользуем логику Telegram)
  result = listsToText(result);

  // Цитаты: WhatsApp не имеет разметки цитат — префиксуем строки «> »
  result = result.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, i: string) => {
    const t = i.replace(/<\/?p\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").trim();
    return t.split("\n").map((l) => (l.trim() ? `> ${l.trim()}` : "")).join("\n") + "\n";
  });

  // Абзацы/переносы → \n
  result = result.replace(/<p><br\s*\/?><\/p>/gi, "\n").replace(/<p><\/p>/gi, "\n");
  result = result.replace(/<\/p>/gi, "\n").replace(/<p\b[^>]*>/gi, "");
  result = result.replace(/<br\s*\/?>/gi, "\n");

  // Срезаем остальные теги
  result = result.replace(/<[^>]+>/g, "");

  // HTML-сущности
  result = result
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  // Схлопываем лишние переносы
  return result.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "").trim();
}
