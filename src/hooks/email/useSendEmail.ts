"use client"

/**
 * Hook: useSendEmail
 * Sends an email via the gmail-send Edge Function.
 * Used from MessengerTabContent when the active chat has an email link.
 *
 * Optimistic update strategy: "via variables" (TanStack Query v5 recommended).
 * We do NOT manipulate the query cache in onMutate — instead, the pending
 * message is rendered from `sendEmail.variables` + `sendEmail.isPending`
 * in MessengerTabContent.  This way Realtime refetches cannot overwrite
 * the optimistic entry because it lives outside the cache.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { messengerKeys, inboxKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'

interface SendEmailParams {
  threadId: string
  content: string
  subject?: string
  files?: File[]
}

export function useSendEmail(projectId: string, workspaceId: string, threadId?: string) {
  const queryClient = useQueryClient()
  const messagesKey = threadId
    ? messengerKeys.messagesByThreadId(threadId)
    : messengerKeys.messages(projectId)

  return useMutation({
    mutationFn: async (params: SendEmailParams) => {
      const files = params.files ?? []
      const hasFiles = files.length > 0

      let attachments:
        | { storagePath: string; fileName: string; mimeType: string; fileSize: number }[]
        | undefined

      if (hasFiles) {
        const uploadResults = await Promise.all(
          files.map(async (file) => {
            const ext = file.name.includes('.') ? '.' + file.name.split('.').pop() : ''
            const safeFileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
            const storagePath = `${workspaceId}/${projectId}/email-attachments/${safeFileName}`

            const { error: uploadError } = await supabase.storage
              .from('files')
              .upload(storagePath, file, {
                upsert: false,
                contentType: file.type || 'application/octet-stream',
              })

            if (uploadError)
              throw new Error(`Ошибка загрузки файла ${file.name}: ${uploadError.message}`)

            return {
              storagePath,
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              fileSize: file.size,
            }
          }),
        )
        attachments = uploadResults
      }

      const { data, error } = await supabase.functions.invoke('gmail-send', {
        body: {
          threadId: params.threadId,
          content: params.content,
          subject: params.subject,
          attachments,
        },
      })

      if (error) throw error
      if (data?.error) throw new Error(data.error)

      // Type assertion safe: response format is controlled by gmail-send Edge Function
      const result = data as { success: boolean; messageId: string; gmailMessageId: string }

      // Create file records and message_attachments for display in chat
      if (hasFiles && attachments && result.messageId) {
        await Promise.all(
          attachments.map(async (att) => {
            const { data: fileRecord, error: fileRecordError } = await supabase
              .from('files')
              .insert({
                workspace_id: workspaceId,
                bucket: 'files',
                storage_path: att.storagePath,
                file_name: att.fileName,
                file_size: att.fileSize,
                mime_type: att.mimeType,
              })
              .select('id')
              .single()

            if (fileRecordError) {
              logger.error('Failed to create file record:', fileRecordError)
              return
            }

            const { error: attachError } = await supabase.from('message_attachments').insert({
              message_id: result.messageId,
              file_name: att.fileName,
              file_size: att.fileSize,
              mime_type: att.mimeType,
              storage_path: att.storagePath,
              file_id: fileRecord.id,
            })

            if (attachError) {
              logger.error('Failed to create message_attachment:', attachError)
            }
          }),
        )
      }

      return result
    },
    onError: (_err) => {
      const msg = _err instanceof Error ? _err.message : 'Не удалось отправить email'
      if (msg.includes('Gmail not connected')) {
        toast.error('Gmail не подключён. Подключите в настройках профиля.')
      } else {
        toast.error(msg)
      }
    },
    onSuccess: () => {
      // Refetch messages to pick up the real message from DB
      queryClient.refetchQueries({ queryKey: messagesKey })
      queryClient.invalidateQueries({ queryKey: inboxKeys.threads(workspaceId) })
    },
  })
}
