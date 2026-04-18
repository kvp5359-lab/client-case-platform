/**
 * Конвертер Tiptap JSON → Telegram HTML.
 * Telegram HTML поддерживает: <b>, <i>, <u>, <s>, <code>, <pre>, <a>, <blockquote>.
 * Списки и заголовки Telegram не понимает — эмулируем через префиксы и <b>.
 *
 * Лимит одного sendMessage — 4096 символов, поэтому возвращаем массив чанков.
 */

interface Node {
  type: string;
  text?: string;
  content?: Node[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  attrs?: Record<string, unknown>;
}

const MAX_MESSAGE_LENGTH = 4000; // с запасом от лимита 4096

export function renderArticle(title: string, content: string | null): string[] {
  let body = "";
  try {
    const json = content ? JSON.parse(content) : null;
    if (json && json.type === "doc" && Array.isArray(json.content)) {
      body = renderNodes(json.content).trim();
    } else if (typeof content === "string") {
      body = escapeHtml(content);
    }
  } catch {
    body = content ? escapeHtml(content) : "";
  }

  const header = `<b>${escapeHtml(title)}</b>\n\n`;
  const full = header + body;

  return chunkMessage(full);
}

function renderNodes(nodes: Node[]): string {
  return nodes.map(renderNode).join("");
}

function renderNode(node: Node): string {
  switch (node.type) {
    case "paragraph": {
      const inner = node.content ? renderInline(node.content) : "";
      return inner + "\n\n";
    }
    case "heading": {
      const inner = node.content ? renderInline(node.content) : "";
      return `<b>${inner}</b>\n\n`;
    }
    case "bulletList":
      return (node.content ?? [])
        .map((li) => "• " + renderInline(li.content ?? []).trim() + "\n")
        .join("") + "\n";
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + renderInline(li.content ?? []).trim() + "\n")
        .join("") + "\n";
    case "listItem":
      return node.content ? renderInline(node.content) : "";
    case "blockquote": {
      const inner = node.content ? renderNodes(node.content).trim() : "";
      return `<blockquote>${inner}</blockquote>\n\n`;
    }
    case "codeBlock": {
      const inner = node.content ? renderInline(node.content) : "";
      return `<pre>${inner}</pre>\n\n`;
    }
    case "hardBreak":
      return "\n";
    case "horizontalRule":
      return "\n———\n\n";
    case "text":
      return applyMarks(escapeHtml(node.text ?? ""), node.marks);
    default:
      return node.content ? renderInline(node.content) : "";
  }
}

function renderInline(nodes: Node[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") {
        return applyMarks(escapeHtml(n.text ?? ""), n.marks);
      }
      if (n.type === "hardBreak") return "\n";
      return renderNode(n);
    })
    .join("");
}

function applyMarks(text: string, marks?: Node["marks"]): string {
  if (!marks || marks.length === 0) return text;
  let out = text;
  for (const m of marks) {
    switch (m.type) {
      case "bold":
      case "strong":
        out = `<b>${out}</b>`;
        break;
      case "italic":
      case "em":
        out = `<i>${out}</i>`;
        break;
      case "underline":
        out = `<u>${out}</u>`;
        break;
      case "strike":
        out = `<s>${out}</s>`;
        break;
      case "code":
        out = `<code>${out}</code>`;
        break;
      case "link": {
        const href = typeof m.attrs?.href === "string" ? m.attrs.href : "";
        if (href) out = `<a href="${escapeAttr(href)}">${out}</a>`;
        break;
      }
    }
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * Режет длинное сообщение на чанки ≤ MAX_MESSAGE_LENGTH, стараясь рвать
 * по границам параграфов.
 */
function chunkMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }
    // Пробуем разбить по двойному переводу строки
    let cutAt = remaining.lastIndexOf("\n\n", MAX_MESSAGE_LENGTH);
    if (cutAt < MAX_MESSAGE_LENGTH / 2) {
      // Если абзац слишком длинный — по одному \n
      cutAt = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    }
    if (cutAt < MAX_MESSAGE_LENGTH / 2) {
      cutAt = MAX_MESSAGE_LENGTH;
    }
    chunks.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  // Добавляем «(часть N/M)» в начало каждого чанка, если их больше одного
  if (chunks.length > 1) {
    return chunks.map((c, i) => `<i>(часть ${i + 1}/${chunks.length})</i>\n\n${c}`);
  }
  return chunks;
}
