/**
 * Builds display messages with optimistic email entry while mutation is in-flight
 */

import { useMemo } from 'react'
import type { ProjectMessage } from '@/services/api/messengerService'

interface UseOptimisticEmailParams {
  messages: ProjectMessage[]
  searchResults: ProjectMessage[]
  isSearchActive: boolean
  projectId?: string
  workspaceId: string
  threadId?: string
  currentParticipant:
    | { participantId: string; name: string; role: string | null }
    | null
    | undefined
  sendEmail: {
    isPending: boolean
    isSuccess: boolean
    variables: { threadId: string; content: string; files?: File[] } | undefined
    data: { messageId?: string } | undefined
  }
}

export function useOptimisticEmail({
  messages,
  searchResults,
  isSearchActive,
  projectId,
  workspaceId,
  threadId,
  currentParticipant,
  sendEmail,
}: UseOptimisticEmailParams): ProjectMessage[] {
  return useMemo(() => {
    const base = isSearchActive ? searchResults : messages

    const vars = sendEmail.variables
    if (!vars) return base

    const realMessageId = sendEmail.data?.messageId
    const realMessageInCache = realMessageId && base.some((m) => m.id === realMessageId)

    if (realMessageInCache) return base

    // Check if real message appeared via Realtime before refetch
    const recentDuplicate = base.some(
      (m) =>
        m.source === 'email' && m.content === vars.content && m.thread_id === (threadId ?? null),
    )
    if (recentDuplicate) return base

    if (sendEmail.isPending || (sendEmail.isSuccess && !realMessageInCache)) {
      const now = new Date().toISOString()
      const optimisticAttachments = (vars.files ?? []).map((file, i) => ({
        id: `optimistic-att-${i}`,
        message_id: 'optimistic-email-pending',
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        storage_path: '',
        telegram_file_id: null,
        transcription: null,
        file_id: null,
        created_at: now,
      }))
      const optimistic: ProjectMessage = {
        id: 'optimistic-email-pending',
        project_id: projectId ?? null,
        workspace_id: workspaceId,
        sender_participant_id: currentParticipant?.participantId ?? null,
        sender_name: currentParticipant?.name ?? 'Вы',
        sender_role: currentParticipant?.role ?? null,
        content: vars.content,
        source: 'email',
        reply_to_message_id: null,
        reply_to_message: null,
        telegram_message_id: null,
        telegram_chat_id: null,
        is_edited: false,
        is_draft: false,
        forwarded_from_name: null,
        forwarded_date: null,
        scheduled_send_at: null,
        channel: 'client',
        thread_id: threadId ?? null,
        email_metadata: null,
        created_at: now,
        updated_at: now,
        reactions: [],
        attachments: optimisticAttachments,
        sender: null,
      }
      return [...base, optimistic]
    }
    return base
  }, [
    isSearchActive,
    searchResults,
    messages,
    sendEmail.isPending,
    sendEmail.isSuccess,
    sendEmail.variables,
    sendEmail.data,
    projectId,
    workspaceId,
    threadId,
    currentParticipant,
  ])
}
