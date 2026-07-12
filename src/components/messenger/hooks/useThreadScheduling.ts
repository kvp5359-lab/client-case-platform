import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { toast } from 'sonner'
import { useScheduleMessage } from '@/hooks/messenger/useScheduleMessage'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import type { MessageChannel, MessageVisibility, ProjectMessage } from '@/services/api/messenger/messengerService'

type ScheduleParticipant = { participantId: string; name: string; role: string | null }

/**
 * Отложенная отправка сообщений треда: планирование, отмена, «отправить сейчас»,
 * перепланирование. Оборачивает useScheduleMessage и отдаёт 4 готовых хендлера
 * с тостами. Вынесено из MessengerTabContent (аудит 2026-07-13) — логика цела.
 */
export function useThreadScheduling(args: {
  projectId?: string
  workspaceId: string
  channel: MessageChannel
  threadId: string
  currentParticipant: ScheduleParticipant | null
  setReplyTo: (m: ProjectMessage | null) => void
  setSendTrigger: Dispatch<SetStateAction<number>>
}): {
  handleSchedule: (
    sendAt: Date,
    content: string,
    replyToId?: string | null,
    files?: File[],
    options?: { visibility?: MessageVisibility; notifySubscribers?: boolean },
  ) => Promise<void>
  handleCancelScheduled: (messageId: string) => Promise<void>
  handleSendScheduledNow: (messageId: string) => Promise<void>
  handleReschedule: (messageId: string, sendAt: Date) => Promise<void>
} {
  const { projectId, workspaceId, channel, threadId, currentParticipant, setReplyTo, setSendTrigger } = args

  const scheduling = useScheduleMessage({ projectId, workspaceId, channel, threadId })

  const handleSchedule = useCallback(
    async (
      sendAt: Date,
      content: string,
      replyToId?: string | null,
      files?: File[],
      options?: { visibility?: MessageVisibility; notifySubscribers?: boolean },
    ) => {
      if (!currentParticipant) return
      try {
        await scheduling.schedule({
          content,
          sendAt,
          attachments: files,
          replyToId: replyToId ?? null,
          senderParticipantId: currentParticipant.participantId,
          senderName: currentParticipant.name,
          senderRole: currentParticipant.role,
          visibility: options?.visibility,
          notifySubscribers: options?.notifySubscribers,
        })
        setReplyTo(null)
        setSendTrigger((prev) => prev + 1)
        toast.success(
          `Запланировано на ${sendAt.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}`,
        )
      } catch (err) {
        toast.error(getUserFacingErrorMessage(err, 'Не удалось запланировать'))
      }
    },
    [scheduling, currentParticipant, setReplyTo, setSendTrigger],
  )

  const handleCancelScheduled = useCallback(
    async (messageId: string) => {
      try {
        await scheduling.cancel(messageId)
      } catch {
        toast.error('Не удалось отменить')
      }
    },
    [scheduling],
  )

  const handleSendScheduledNow = useCallback(
    async (messageId: string) => {
      try {
        await scheduling.sendNow(messageId)
        toast.success('Отправлено')
      } catch (err) {
        toast.error(getUserFacingErrorMessage(err, 'Не удалось отправить'))
      }
    },
    [scheduling],
  )

  const handleReschedule = useCallback(
    async (messageId: string, sendAt: Date) => {
      try {
        await scheduling.reschedule({ messageId, sendAt })
      } catch (err) {
        toast.error(getUserFacingErrorMessage(err, 'Не удалось перепланировать'))
      }
    },
    [scheduling],
  )

  return { handleSchedule, handleCancelScheduled, handleSendScheduledNow, handleReschedule }
}
