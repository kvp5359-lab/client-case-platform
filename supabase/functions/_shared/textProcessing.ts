/**
 * Text processing utilities for knowledge base indexing.
 * Used by: knowledge-index.
 *
 * Provides: HTML stripping with list preservation, text chunking with overlap.
 */

const CHUNK_MAX_CHARS = 2000; // ~500 tokens
const CHUNK_OVERLAP_CHARS = 200; // ~50 tokens

/** Strip HTML tags and decode entities, preserving list numbering and nesting */
export function stripHtml(html: string): string {
  let text = html;

  // Process lists inside-out: repeatedly convert innermost lists first
  // This handles nested <ul> inside <ol> correctly
  const MAX_DEPTH = 10;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    const before = text;

    // Convert innermost <ul> (those with no nested <ul>/<ol> inside)
    text = text.replace(
      /<ul[^>]*>((?:(?!<\/?[ou]l[\s>]).)*?)<\/ul>/gis,
      (_match, inner: string) => {
        return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
          return `• ${content.trim()}\n`;
        });
      },
    );

    // Convert innermost <ol> (those with no nested <ul>/<ol> inside)
    text = text.replace(
      /<ol([^>]*)>((?:(?!<\/?[ou]l[\s>]).)*?)<\/ol>/gis,
      (_match, attrs: string, inner: string) => {
        // Support <ol start="N"> for continued numbering
        const startMatch = attrs.match(/start\s*=\s*["']?(\d+)["']?/i);
        let idx = startMatch ? parseInt(startMatch[1], 10) - 1 : 0;
        return inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
          idx++;
          return `${idx}. ${content.trim()}\n`;
        });
      },
    );

    if (text === before) break; // No more lists to process
  }

  // Indent nested items: bullets after a numbered line get indented
  text = text.replace(/(\d+\. [^\n]*)\n((?:• [^\n]*\n)+)/g, (_match, numbered: string, bullets: string) => {
    const indented = bullets.replace(/^• /gm, "  • ");
    return `${numbered}\n${indented}`;
  });

  // Convert remaining standalone <li> (not inside ol/ul)
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, content: string) => `• ${content.trim()}\n`);

  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Split text into chunks with overlap */
export function chunkText(text: string): string[] {
  if (text.length <= CHUNK_MAX_CHARS) {
    return [text];
  }

  const paragraphs = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (current && (current + "\n\n" + trimmed).length > CHUNK_MAX_CHARS) {
      chunks.push(current.trim());
      // Overlap: keep last part of current chunk
      const words = current.split(/\s+/);
      const overlapWords = words.slice(
        -Math.ceil(CHUNK_OVERLAP_CHARS / 5),
      );
      current = overlapWords.join(" ") + "\n\n" + trimmed;
    } else {
      current += (current ? "\n\n" : "") + trimmed;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  // Handle case where single paragraph is too long
  const result: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= CHUNK_MAX_CHARS) {
      result.push(chunk);
    } else {
      // Force split by sentences
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let part = "";
      for (const sentence of sentences) {
        if (part && (part + " " + sentence).length > CHUNK_MAX_CHARS) {
          result.push(part.trim());
          part = sentence;
        } else {
          part += (part ? " " : "") + sentence;
        }
      }
      if (part.trim()) result.push(part.trim());
    }
  }

  return result;
}
