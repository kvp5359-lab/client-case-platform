import type { MessageAttachment as AttachmentType } from '@/services/api/messenger/messengerService'

export function isImage(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/')
}

export function isAudio(mimeType: string | null): boolean {
  return !!mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/ogg'))
}

export function isVoice(attachment: AttachmentType): boolean {
  return !!attachment.file_name?.startsWith('voice_')
}

/** Вложение-аудио: по mime (audio/*, video/ogg) ИЛИ по имени голосового. */
export function isAudioAttachment(attachment: AttachmentType): boolean {
  return isAudio(attachment.mime_type) || isVoice(attachment)
}
