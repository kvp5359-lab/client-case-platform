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
  sticker?: { file_id: string; file_unique_id: string; emoji?: string };
  new_chat_members?: TgUser[];
  left_chat_member?: TgUser;
  new_chat_title?: string;
  group_chat_created?: boolean;
  supergroup_chat_created?: boolean;
  pinned_message?: TgMessage;
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
