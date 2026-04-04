import type { MessageAttachment as AttachmentType } from '@/services/api/messengerService'

export function isImage(mimeType: string | null): boolean {
  return !!mimeType && mimeType.startsWith('image/')
}

export function isAudio(mimeType: string | null): boolean {
  return !!mimeType && (mimeType.startsWith('audio/') || mimeType.startsWith('video/ogg'))
}

export function isVoice(attachment: AttachmentType): boolean {
  return !!attachment.file_name?.startsWith('voice_')
}
