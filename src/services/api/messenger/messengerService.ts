/**
 * Messenger service — barrel re-export.
 *
 * Логика сервиса разъехалась по соседним файлам, этот остаётся как
 * единая точка импорта (`@/services/api/messenger/messengerService`):
 *
 *   - messengerService.types.ts    — публичные типы (ProjectMessage и т.п.)
 *   - messengerService.helpers.ts  — MESSAGE_SELECT + castToProjectMessage(s)
 *                                    + hydrateReplyMessages (internal)
 *   - messengerService.read.ts     — getMessages / getProjectMessages*
 *   - messengerService.send.ts     — sendMessage + shouldSplitTextAndFiles
 *                                    + SendMessageParams

 *   - messengerService.edit.ts     — deleteMessage / editMessage
 *
 * Под-сервисы (attachments / reactions / read-status / participant / draft)
 * — отдельные файлы в этой же папке, реэкспортятся ниже.
 */

// Types
export type {
  MessageChannel,
  MessageVisibility,
  MessageReaction,
  ReplyMessage,
  ProjectMessage,
  EmailMetadata,
  MessageAttachment,
  ForwardedAttachment,
} from './messengerService.types'

// Send / Edit / Read
export {
  getMessages,
  getProjectMessagesByChannel,
  getProjectMessages,
  getThreadMessages,
  backfillTelegramHistory,
} from './messengerService.read'
export {
  sendMessage,
  shouldSplitTextAndFiles,
  type SendMessageParams,
} from './messengerService.send'
export {
  deleteMessage,
  editMessage,
} from './messengerService.edit'

// Sub-services (already separate files)
export {
  uploadAttachments,
  getAttachmentUrl,
  canInlinePreview,
  downloadAttachmentBlob,
  fetchAttachmentBlob,
  downloadAttachmentAsFile,
  deleteAttachment,
  type DeleteAttachmentResult,
} from './messengerAttachmentService'
export { toggleReaction } from './messengerReactionService'
export {
  markAsRead,
  markAsUnread,
  getLastReadAt,
  getThreadLastReadAtForUser,
  getUnreadCount,
} from './messengerReadStatusService'
export {
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  resolveParticipantFull,
  resolveParticipantId,
  type ResolvedParticipant,
} from './messengerParticipantService'
export {
  saveDraftMessage,
  updateDraftMessage,
  publishDraftMessage,
  type SaveDraftParams,
} from './messengerDraftService'
