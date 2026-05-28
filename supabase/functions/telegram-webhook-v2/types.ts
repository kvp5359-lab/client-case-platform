/**
 * Подмножество типов Telegram Bot API + внутренние типы webhook'а.
 * Вынесено из index.ts (2227 → ~2100 строк).
 */

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export interface TgEntity {
  type: string;
  offset: number;
  length: number;
  url?: string;
  user?: TgUser;
}

export interface TgPhotoSize {
  file_id: string;
  file_unique_id: string;
}

export interface TgDocument {
  file_id: string;
  file_unique_id: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TgMessage {
  chat: { id: number; title?: string; type?: string };
  message_id: number;
  from?: TgUser;
  date: number;
  media_group_id?: string;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  reply_to_message?: { message_id: number };
  photo?: TgPhotoSize[];
  document?: TgDocument;
  video?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number };
  voice?: { file_id: string; file_unique_id: string; mime_type?: string; file_size?: number };
  audio?: { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number };
  video_note?: { file_id: string; file_unique_id: string };
  // Стикер: для UI качаем thumbnail (JPEG-превью), сам sticker в WEBP/TGS браузер не отрисует.
  sticker?: {
    file_id: string;
    file_unique_id: string;
    emoji?: string;
    is_animated?: boolean;
    is_video?: boolean;
    thumbnail?: { file_id: string; file_unique_id: string; file_size?: number };
  };
  // Анимация (GIF): MP4 + thumbnail. Качаем thumbnail для превью; сам файл — опционально.
  animation?: {
    file_id: string;
    file_unique_id: string;
    file_name?: string;
    mime_type?: string;
    file_size?: number;
    thumbnail?: { file_id: string; file_unique_id: string; file_size?: number };
  };
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  new_chat_title?: string;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  pinned_message?: TgMessage;
  // Telegram присылает оба поля при превращении обычной группы в супергруппу:
  // в OLD chat_id приходит сообщение с migrate_to_chat_id = NEW id, в NEW chat_id
  // — зеркальное с migrate_from_chat_id. Мы реагируем на первое: переписываем
  // project_telegram_chats.telegram_chat_id, чтобы будущие сообщения находили
  // привязку.
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
  forward_origin?: {
    type: string;
    date: number;
    sender_user?: TgUser;
    sender_user_name?: string;
    sender_chat?: { id: number; title?: string };
    chat?: { id: number; title?: string };
  };
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgReaction {
  chat: { id: number };
  message_id: number;
  user?: TgUser;
  new_reaction?: { type: "emoji" | "custom_emoji"; emoji?: string }[];
}

export interface TgInlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}
export type TgInlineKeyboard = TgInlineButton[][];

export interface TgChatBinding {
  project_id: string;
  workspace_id: string;
  channel: string;
  thread_id: string | null;
}

export interface TgFileDescriptor {
  fileId: string;
  originalName: string;
  safeName: string;
  mimeType: string;
}

export interface BotSession {
  state: string;
  context: Record<string, unknown>;
}

/**
 * Контекст интеграции, которой принадлежит входящий webhook. Прокидывается
 * из entry-функции через handleMessage/handleCallback во все нижние модули.
 *
 * - `workspace`: telegram_workspace_bot — секретарь, полный функционал (команды,
 *   inline-меню, knowledge, upload-slot, sessions). `asPersonalBot = null` при
 *   записи в `project_messages` (тред считается «секретарским»).
 * - `employee`: telegram_employee_bot — личный бот сотрудника. Только приём
 *   сообщений, реакции, edit, dedup. Команды /menu/knowledge/upload/status молчат;
 *   inline-кнопки молчат; sessions не открываются. `asPersonalBot = { integrationId,
 *   workspaceId, botId }` — нужно для multi-bot dedup и корректного reply-lookup
 *   в counter этого же бота.
 *
 * `botId` берётся из `workspace_integrations.config.bot_id`. Может быть null для
 * старых записей без сидов конфига — тогда multi-bot dedup полагается только на
 * (chat_id, sender_user_id, date, file_unique_id).
 */
export interface IntegrationContext {
  id: string;
  workspaceId: string;
  botId: number | null;
  mode: "workspace" | "employee";
}
