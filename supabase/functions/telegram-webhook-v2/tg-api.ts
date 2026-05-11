/**
 * Тонкие обёртки над Telegram Bot API: tgCall, sendMessage, editMessage,
 * answerCallback. Все используют общий `getBotToken()` из ./shared.ts.
 *
 * Вынесено из index.ts чтобы handler'ы можно было распилить по файлам без
 * передачи токена параметром на каждом шаге.
 */

import { getBotToken } from "./shared.ts";
import type { TgInlineKeyboard } from "./types.ts";

export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${getBotToken()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`[tg ${method}] error:`, json.description, body);
      return null;
    }
    return json.result as T;
  } catch (err) {
    console.error(`[tg ${method}] fetch failed:`, err);
    return null;
  }
}

export type SendReplyMarkup =
  | { inline_keyboard: TgInlineKeyboard }
  | { keyboard: { text: string }[][]; resize_keyboard?: boolean; is_persistent?: boolean; selective?: boolean }
  | { remove_keyboard: true };

export async function sendMessage(
  chatId: number,
  text: string,
  opts: { reply_markup?: SendReplyMarkup; parse_mode?: string; reply_to_message_id?: number } = {},
) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: opts.parse_mode ?? "HTML",
    disable_web_page_preview: true,
    ...opts,
  });
}

export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: TgInlineKeyboard,
) {
  return tgCall("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard ? { inline_keyboard: keyboard } : undefined,
  });
}

export async function answerCallback(id: string, text?: string) {
  return tgCall("answerCallbackQuery", { callback_query_id: id, text });
}
