/**
 * Чистые helpers без зависимостей от глобального `service`/`BOT_TOKEN`.
 * Вынесены из index.ts для уменьшения монолита (2227 → ~2000 строк).
 *
 * Все функции pure (или работают с константами модуля) — можно тестировать
 * изолированно без mock'ов Supabase.
 */

import { encode as encodeCb } from "./callback-data.ts";
import type {
  TgUser,
  TgMessage,
  TgFileDescriptor,
  TgInlineKeyboard,
} from "./types.ts";

export const MAX_FILE_SIZE_MB = 20;
export const MENU_REPLY_BUTTON_TEXT = "📋 Меню";

export function formatUserName(u: TgUser | undefined): string {
  if (!u) return "Пользователь";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Пользователь";
}

export function sanitizeFileName(name: string): string {
  const cyr: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ё:"yo",ж:"zh",з:"z",и:"i",й:"j",
    к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",ф:"f",
    х:"kh",ц:"ts",ч:"ch",ш:"sh",щ:"shch",ъ:"",ы:"y",ь:"",э:"e",ю:"yu",я:"ya",
    А:"A",Б:"B",В:"V",Г:"G",Д:"D",Е:"E",Ё:"Yo",Ж:"Zh",З:"Z",И:"I",Й:"J",
    К:"K",Л:"L",М:"M",Н:"N",О:"O",П:"P",Р:"R",С:"S",Т:"T",У:"U",Ф:"F",
    Х:"Kh",Ц:"Ts",Ч:"Ch",Ш:"Sh",Щ:"Shch",Ъ:"",Ы:"Y",Ь:"",Э:"E",Ю:"Yu",Я:"Ya",
  };
  const ext = name.includes(".") ? "." + name.split(".").pop() : "";
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  const t = base.split("").map((c) => cyr[c] ?? c).join("");
  return t.replace(/[^a-zA-Z0-9._\-() ]/g, "_").replace(/\s+/g, "_") + ext;
}

export function getServiceMessageText(msg: TgMessage): string | null {
  const fromName = formatUserName(msg.from);
  if (msg.group_chat_created || msg.supergroup_chat_created) {
    return `${fromName} создал(а) группу` + (msg.chat.title ? ` «${msg.chat.title}»` : "");
  }
  if (msg.new_chat_members && msg.new_chat_members.length > 0) {
    const names = msg.new_chat_members.map(formatUserName);
    if (names.length === 1 && msg.from?.id === msg.new_chat_members[0].id) {
      return `${names[0]} присоединился(-ась) к группе`;
    }
    return `${fromName} добавил(а) ${names.join(", ")}`;
  }
  if (msg.left_chat_member) {
    const left = formatUserName(msg.left_chat_member);
    return msg.from?.id === msg.left_chat_member.id
      ? `${left} покинул(а) группу`
      : `${fromName} удалил(а) ${left}`;
  }
  if (msg.new_chat_title) return `${fromName} изменил(а) название на «${msg.new_chat_title}»`;
  if (msg.pinned_message) return `${fromName} закрепил(а) сообщение`;
  return null;
}

export function extractForward(msg: TgMessage): { name: string | null; date: string | null } {
  if (!msg.forward_origin) return { name: null, date: null };
  const o = msg.forward_origin;
  const date = new Date(o.date * 1000).toISOString();
  switch (o.type) {
    case "user":
      return { name: o.sender_user ? formatUserName(o.sender_user) : null, date };
    case "hidden_user":
      return { name: o.sender_user_name ?? "Скрытый пользователь", date };
    case "chat":
    case "channel":
      return { name: o.sender_chat?.title ?? o.chat?.title ?? null, date };
    default:
      return { name: "Переслано", date };
  }
}

export function collectFiles(msg: TgMessage): TgFileDescriptor[] {
  const out: TgFileDescriptor[] = [];
  if (msg.photo && msg.photo.length > 0) {
    const p = msg.photo[msg.photo.length - 1];
    const name = `photo_${p.file_unique_id}.jpg`;
    out.push({ fileId: p.file_id, originalName: name, safeName: name, mimeType: "image/jpeg" });
  }
  if (msg.document) {
    const orig = msg.document.file_name || `document_${msg.document.file_unique_id}`;
    out.push({
      fileId: msg.document.file_id,
      originalName: orig,
      safeName: sanitizeFileName(orig),
      mimeType: msg.document.mime_type || "application/octet-stream",
    });
  }
  if (msg.voice) {
    const name = `voice_${msg.voice.file_unique_id}.ogg`;
    out.push({ fileId: msg.voice.file_id, originalName: name, safeName: name, mimeType: msg.voice.mime_type || "audio/ogg" });
  }
  if (msg.audio) {
    const orig = msg.audio.file_name || `audio_${msg.audio.file_unique_id}`;
    out.push({
      fileId: msg.audio.file_id,
      originalName: orig,
      safeName: sanitizeFileName(orig),
      mimeType: msg.audio.mime_type || "audio/mpeg",
    });
  }
  if (msg.video) {
    const name = `video_${msg.video.file_unique_id}.mp4`;
    out.push({ fileId: msg.video.file_id, originalName: name, safeName: name, mimeType: msg.video.mime_type || "video/mp4" });
  }
  if (msg.video_note) {
    const name = `videonote_${msg.video_note.file_unique_id}.mp4`;
    out.push({ fileId: msg.video_note.file_id, originalName: name, safeName: name, mimeType: "video/mp4" });
  }
  // Стикер: качаем JPEG-thumbnail (сам WEBP/TGS-стикер браузер не отрисует).
  // Если thumbnail отсутствует (редкий случай) — отображение остаётся текстовым
  // ("🟪 Стикер emoji"), это устанавливается в syncTelegramIncomingMessage.
  if (msg.sticker?.thumbnail) {
    const name = `sticker_${msg.sticker.file_unique_id}.jpg`;
    out.push({
      fileId: msg.sticker.thumbnail.file_id,
      originalName: name,
      safeName: name,
      mimeType: "image/jpeg",
    });
  }
  // GIF/анимация: качаем JPEG-thumbnail для превью в UI. Сам MP4 не качаем,
  // чтобы не переполнять Storage большими файлами — для просмотра достаточно превью.
  if (msg.animation?.thumbnail) {
    const name = `animation_${msg.animation.file_unique_id}.jpg`;
    out.push({
      fileId: msg.animation.thumbnail.file_id,
      originalName: name,
      safeName: name,
      mimeType: "image/jpeg",
    });
  }
  return out;
}

export function helpText(): string {
  return [
    "<b>Бот проекта ClientCase</b>",
    "",
    "Команды в группе проекта:",
    "• /menu — главное меню",
    "• /knowledge — полезные материалы",
    "• /requirements — требования к документам",
    "• /upload — загрузить документ в слот",
    "• /status — статус документов",
    "",
    "Команды для админа:",
    "• /link КОД — привязать группу к проекту",
    "• /unlink — отвязать группу",
  ].join("\n");
}

/** Inline-клавиатура главного меню — используется и в /menu, и в callback menu_home. */
export function mainMenuInlineKeyboard(): TgInlineKeyboard {
  return [
    [
      { text: "📚 Полезные материалы", callback_data: encodeCb({ kind: "kb_group", groupId: null, page: 0 }) },
      { text: "❓ Требования", callback_data: encodeCb({ kind: "folder_info" }) },
    ],
    [
      { text: "📎 Загрузить документ", callback_data: encodeCb({ kind: "upload_start" }) },
      { text: "📊 Статус документов", callback_data: encodeCb({ kind: "doc_status" }) },
    ],
  ];
}

/**
 * Постоянная reply-клавиатура с одной кнопкой «📋 Меню» — держится в чате
 * всегда. Тап отправляет текст MENU_REPLY_BUTTON_TEXT, handleMessage его
 * перехватывает и запускает главное меню.
 */
export function menuReplyKeyboard() {
  return {
    keyboard: [[{ text: MENU_REPLY_BUTTON_TEXT }]],
    resize_keyboard: true,
    is_persistent: true,
  };
}

export function mapUploadError(reason: string): string {
  switch (reason) {
    case "no_file":
      return "Не вижу файла в сообщении. Прикрепите документ или фото.";
    case "multiple_files":
      return "Пожалуйста, пришлите один файл за раз.";
    case "too_large":
      return `⚠️ Файл больше ${MAX_FILE_SIZE_MB} МБ. Загрузите его через веб-интерфейс ClientCase.`;
    case "download_failed":
      return `⚠️ Не удалось получить файл (возможно, больше ${MAX_FILE_SIZE_MB} МБ). Загрузите через веб.`;
    default:
      return "⚠️ Не удалось загрузить документ.";
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
