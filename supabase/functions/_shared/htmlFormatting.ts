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

  // <ol> с <li> → нумерованный текст (Telegram не поддерживает <ol>/<li>)
  result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/g, (_match, inner: string) => {
    let counter = 0;
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, content: string) => {
      counter++;
      // Убираем <p> обёртки внутри <li>
      const clean = content.replace(/<p>/g, "").replace(/<\/p>/g, "");
      return `${counter}. ${clean}\n`;
    });
  });

  // <ul> с <li> → маркированный текст (Telegram не поддерживает <ul>/<li>)
  result = result.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/g, (_match, inner: string) => {
    return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/g, (_m: string, content: string) => {
      const clean = content.replace(/<p>/g, "").replace(/<\/p>/g, "");
      return `• ${clean}\n`;
    });
  });

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
