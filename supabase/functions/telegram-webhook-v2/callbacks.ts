/**
 * Маршрутизатор callback_query (нажатия inline-кнопок).
 *
 * Каждая кнопка кодирует action через ./callback-data.ts, тут декодируем и
 * вызываем соответствующий handler из knowledge.ts / upload-slot.ts /
 * commands.ts.
 */

import { editMessage, answerCallback, sendMessage } from "./tg-api.ts";
import { decode as decodeCb, encode as encodeCb } from "./callback-data.ts";
import { mainMenuInlineKeyboard } from "./pure.ts";
import { clearSession } from "./session.ts";
import { showKbGroups, showArticle } from "./knowledge.ts";
import {
  showUploadSlots,
  showUploadFolderSlots,
  showDocStatus,
  showFolderArticle,
  onSlotSelected,
  onFreeUploadSelected,
} from "./upload-slot.ts";
import { showFolderInfo } from "./commands.ts";
import type { IntegrationContext, TgCallbackQuery } from "./types.ts";

const MAIN_MENU_TEXT = "<b>Главное меню</b>\n\nВыберите раздел:";

export async function handleCallback(cb: TgCallbackQuery, ctx: IntegrationContext) {
  if (!cb.data || !cb.message) {
    await answerCallback(cb.id);
    return;
  }
  // У employee-бота нет inline-меню — если кто-то прислал callback (теоретически
  // через старую кнопку секретаря в той же группе), отвечаем тихим acknowledge
  // и выходим. Логика меню/knowledge/upload — только для workspace mode.
  if (ctx.mode === "employee") {
    await answerCallback(cb.id);
    return;
  }
  const action = decodeCb(cb.data);
  if (!action) {
    await answerCallback(cb.id, "Неизвестная команда.");
    return;
  }
  const chatId = cb.message.chat.id;
  const msgId = cb.message.message_id;

  switch (action.kind) {
    case "menu_home":
      await answerCallback(cb.id);
      await clearSession(chatId, cb.from.id);
      await editMessage(chatId, msgId, MAIN_MENU_TEXT, mainMenuInlineKeyboard());
      return;
    case "kb_group":
      await answerCallback(cb.id);
      await showKbGroups(chatId, action.groupId, action.page, msgId);
      return;
    case "kb_article":
      await answerCallback(cb.id);
      await showArticle(chatId, action.articleId, cb.from);
      return;
    case "upload_start":
      await answerCallback(cb.id);
      await showUploadSlots(chatId, cb.from, msgId);
      return;
    case "upload_folder":
      await answerCallback(cb.id);
      await showUploadFolderSlots(chatId, cb.from, action.folderId, msgId);
      return;
    case "doc_status":
      await answerCallback(cb.id);
      await showDocStatus(chatId, msgId);
      return;
    case "folder_info":
      await answerCallback(cb.id);
      await showFolderInfo(chatId, msgId);
      return;
    case "folder_article":
      await answerCallback(cb.id);
      await showFolderArticle(chatId, action.folderId, cb.from);
      return;
    case "upload_slot":
      await answerCallback(cb.id);
      await onSlotSelected(chatId, cb.from, action.slotId, msgId);
      return;
    case "upload_free":
      await answerCallback(cb.id);
      await onFreeUploadSelected(chatId, cb.from, null, msgId);
      return;
    case "upload_folder_free":
      await answerCallback(cb.id);
      await onFreeUploadSelected(chatId, cb.from, action.folderId, msgId);
      return;
    case "upload_cancel":
      await answerCallback(cb.id, "Отменено.");
      await clearSession(chatId, cb.from.id);
      await editMessage(chatId, msgId, "Загрузка отменена.");
      return;
    case "upload_finish":
      // «Готово» — пользователь завершил многофайловую загрузку. Сессию закрываем,
      // но в отличие от «Отмена» не переписываем историю как «Отменено» — ведь
      // файлы реально загружены. Просто показываем подтверждение и меню.
      await answerCallback(cb.id, "Готово!");
      await clearSession(chatId, cb.from.id);
      await sendMessage(chatId, "✅ Загрузка завершена. Что дальше?", {
        reply_markup: { inline_keyboard: mainMenuInlineKeyboard() },
      });
      return;
    case "nav_back":
      await answerCallback(cb.id);
      if (action.screen === "kb") await showKbGroups(chatId, null, 0, msgId);
      else await editMessage(chatId, msgId, "<b>Главное меню</b>", [
        [{ text: "📚 База знаний", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) }],
      ]);
      return;
    default:
      await answerCallback(cb.id);
  }
}
