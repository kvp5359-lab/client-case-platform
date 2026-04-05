/**
 * Типы messengerService, вынесенные в отдельный файл.
 * Нужны для разрыва цикла: messengerService -> *AttachmentService/*ReadStatusService -> messengerService.
 * Под-сервисы теперь импортируют типы отсюда, а не из messengerService.
 */

export type MessageChannel = 'client' | 'internal'

export interface MessageReaction {
  id: string
  message_id: string
  participant_id: string | null
  emoji: string
  telegram_user_id: number | null
  telegram_user_name: string | null
  created_at: string
  participant: { name: string; last_name: string | null; avatar_url: string | null } | null
}

export interface ReplyMessage {
  id: string
  content: string
  sender_name: string
}

export interface EmailMetadata {
  gmail_message_id: string
  message_id_header: string | null
  in_reply_to: string | null
  from_email: string
  to_emails: string[]
  cc_emails: string[]
  subject: string | null
  body_html: string | null
  attachments: { name: string; size: number; mimeType: string; gmailAttachmentId: string }[] | null
}

export interface MessageAttachment {
  id: string
  message_id: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  storage_path: string
  telegram_file_id: string | null
  transcription: string | null
  file_id: string | null
  created_at: string
}

export interface ProjectMessage {
  id: string
  project_id: string | null
  workspace_id: string
  sender_participant_id: string | null
  sender_name: string
  sender_role: string | null
  content: string
  source: 'web' | 'telegram' | 'email' | 'telegram_service'
  reply_to_message_id: string | null
  reply_to_message: ReplyMessage | null
  telegram_message_id: number | null
  telegram_chat_id: number | null
  is_edited: boolean
  is_draft: boolean
  forwarded_from_name: string | null
  forwarded_date: string | null
  scheduled_send_at: string | null
  channel: MessageChannel
  thread_id: string | null
  email_metadata: EmailMetadata | null
  created_at: string
  updated_at: string
  reactions: MessageReaction[]
  attachments: MessageAttachment[]
  sender: { avatar_url: string | null } | null
}

/** Метаданные вложения для пересылки (без повторной загрузки в Storage) */
export interface ForwardedAttachment {
  file_id: string
  file_name: string
  file_size: number | null
  mime_type: string | null
  storage_path: string
}
