"use client"

/**
 * Хук для отправки сообщения в чат проекта.
 *
 * После audit S1 cleanup-а threadId стал обязательным, legacy-режим
 * (projectId+channel без thread_id) удалён.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import {
  sendMessage,
  shouldSplitTextAndFiles,
  markAsRead,
  getCurrentProjectParticipant,
  getCurrentWorkspaceParticipant,
  type ProjectMessage,
  type ReplyMessage,
  type MessageChannel,
  type ForwardedAttachment,
} from '@/services/api/messenger/messengerService'
import { messengerKeys, invalidateMessengerCaches } from '@/hooks/queryKeys'
import { patchCachesForMarkRead } from './useUnreadCount'
import { dismissProjectToasts } from './useMessageToastPayload'
import { logSendFailure } from '@/services/api/messenger/logSendFailure'

export function useSendMessage(
  projectId: string | undefined,
  workspaceId: string,
  currentParticipant: { participantId: string; name: string; role: string | null } | undefined,
  channel: MessageChannel,
  threadId: string,
  opts?: { isEmailChat?: boolean },
) {
  const isEmailChat = !!opts?.isEmailChat
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const messagesKey = messengerKeys.messagesByThreadId(threadId)

  type SendVars = {
    content: string
    replyToMessageId?: string | null
    replyToMessage?: ProjectMessage | null
    attachments?: File[]
    forwardedAttachments?: ForwardedAttachment[]
    originalContent?: string | null
    originalLanguage?: string | null
    /** Явный override isEmailChat — для свежесозданных тредов, где
     *  useEmailLink/threadRow ещё не успели загрузиться (race). */
    isEmailChat?: boolean
  }

  return useMutation<ProjectMessage[], Error, SendVars, { previous: unknown }>({
    // mutationKey используется в useProjectMessages для блокировки
    // конкурирующих refetch'ей (через queryClient.isMutating). Без этого
    // realtime message_attachments / project_messages триггерил refetch
    // до того, как mutationFn успевал поставить настоящее сообщение —
    // optimistic мигал и пропадал.
    mutationKey: ['sendMessage', threadId],
    mutationFn: async ({
      content,
      replyToMessageId,
      attachments,
      forwardedAttachments,
      originalContent,
      originalLanguage,
    }) => {
      if (!user) throw new Error('Не авторизован')

      const participant =
        currentParticipant ??
        (projectId
          ? await getCurrentProjectParticipant(projectId, user.id)
          : await getCurrentWorkspaceParticipant(workspaceId, user.id))
      if (!participant) throw new Error('Нет доступа')

      return sendMessage({
        projectId,
        workspaceId,
        content,
        senderParticipantId: participant.participantId,
        senderName: participant.name,
        senderRole: participant.role,
        replyToMessageId,
        attachments,
        forwardedAttachments,
        channel,
        threadId,
        originalContent,
        originalLanguage,
      })
    },
    // Оптимистичное обновление
    onMutate: async ({
      content,
      replyToMessageId,
      replyToMessage,
      attachments,
      forwardedAttachments,
      isEmailChat: isEmailChatOverride,
    }) => {
      const qk = messagesKey
      await queryClient.cancelQueries({ queryKey: qk })
      const previous = queryClient.getQueryData(qk)

      let replyData: ReplyMessage | null = null
      if (replyToMessage && replyToMessageId) {
        replyData = {
          id: replyToMessage.id,
          content: replyToMessage.content,
          sender_name: replyToMessage.sender_name,
        }
      }

      const now = new Date().toISOString()
      // Для email-тредов split отключаем (как и в sendMessage server-side):
      // одно письмо с текстом и файлами вместе → один баббл в UI.
      // Per-call override приоритетнее opts (нужен для свежесозданных тредов,
      // где useEmailLink/thread.type ещё не успели загрузиться к моменту mutate).
      const effectiveIsEmailChat = isEmailChatOverride ?? isEmailChat
      const willSplit =
        !effectiveIsEmailChat &&
        shouldSplitTextAndFiles({ content, attachments, forwardedAttachments })

      const makeOptimistic = (
        suffix: 'text' | 'files' | 'single',
        overrides: Partial<ProjectMessage>,
      ): ProjectMessage => {
        const id = `optimistic-${suffix}-${crypto.randomUUID()}`
        return {
          id,
          project_id: projectId ?? null,
          workspace_id: workspaceId,
          sender_participant_id: currentParticipant?.participantId ?? null,
          sender_name: currentParticipant?.name ?? 'Вы',
          sender_role: currentParticipant?.role ?? null,
          content,
          source: 'web',
          reply_to_message_id: replyToMessageId ?? null,
          reply_to_message: replyData,
          telegram_message_id: null,
          telegram_chat_id: null,
          telegram_attachments_delivered: null,
          send_status: 'pending',
          is_edited: false,
          is_draft: false,
          forwarded_from_name: null,
          forwarded_date: null,
          scheduled_send_at: null,
          channel,
          thread_id: threadId,
          email_metadata: null,
          created_at: now,
          updated_at: now,
          reactions: [],
          attachments: [],
          sender: null,
          ...overrides,
        }
      }

      const optimisticFilesAttachments = (attachments ?? []).map((file, i) => ({
        id: `optimistic-att-${crypto.randomUUID()}-${i}`,
        message_id: '',
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || null,
        storage_path: '',
        telegram_file_id: null,
        transcription: null,
        file_id: null,
        created_at: now,
      }))

      const optimisticList: ProjectMessage[] = willSplit
        ? [
            makeOptimistic('text', { content, attachments: [] }),
            makeOptimistic('files', {
              content: '📎',
              reply_to_message_id: null,
              reply_to_message: null,
              attachments: optimisticFilesAttachments,
            }),
          ]
        : [
            makeOptimistic('single', {
              content,
              attachments: optimisticFilesAttachments,
            }),
          ]

      queryClient.setQueryData(qk, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        // Свежесозданный тред — кэша ещё нет. Инициализируем пустую
        // структуру, чтобы оптимистический бабл показался мгновенно,
        // а не ждал первого fetch'а useProjectMessages.
        if (!typed) {
          return {
            pages: [{ messages: optimisticList, hasMore: false }],
            pageParams: [undefined],
          }
        }
        const pages = [...typed.pages]
        const last = pages[pages.length - 1]
        pages[pages.length - 1] = {
          ...last,
          messages: [...last.messages, ...optimisticList],
        }
        return { ...typed, pages }
      })

      return { previous }
    },
    onError: (err, vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(messagesKey, context.previous)
      }
      // Возвращаем неотправленный текст в черновик и удаляем outbox-копию.
      if (threadId && vars.content && vars.content !== '📎') {
        try {
          localStorage.setItem(`msg_draft:${threadId}`, vars.content)
          localStorage.removeItem(`msg_outbox:${threadId}`)
          window.dispatchEvent(
            new CustomEvent('messenger:restore-draft', {
              detail: { threadId, content: vars.content },
            }),
          )
        } catch {
          /* quota / SSR */
        }
      }
      // Локальный toast — для текущего юзера в текущей вкладке.
      // Глобальный sticky-toast поверх всего воркспейса (с кнопкой
      // «Открыть чат») приедет из realtime-подписки на message_send_failures
      // — он переживёт смену вкладки/перезагрузку, придёт на любое устройство.
      toast.error('Не удалось отправить — текст возвращён в поле ввода')

      // Серверный лог — fire-and-forget, не блокируем UI и не падаем дополнительно.
      void logSendFailure({
        workspace_id: workspaceId,
        project_id: projectId ?? null,
        thread_id: threadId,
        participant_id: currentParticipant?.participantId ?? null,
        content: vars.content ?? null,
        attachment_names:
          (vars.attachments ?? []).map((f) => f.name).concat(
            (vars.forwardedAttachments ?? []).map((a) => a.file_name ?? 'file'),
          ) ?? null,
        error_text: err instanceof Error ? err.message : String(err),
        source: channel === 'internal' ? 'web' : 'web',
        metadata: {
          channel,
          has_reply: !!vars.replyToMessageId,
          has_attachments:
            (vars.attachments?.length ?? 0) + (vars.forwardedAttachments?.length ?? 0) > 0,
        },
      }).catch((logErr) => {
        // Если даже логирование упало — пишем в консоль для дев-диагностики.
        console.warn('[log-send-failure] failed:', logErr)
      })
    },
    onSuccess: (result, variables) => {
      // Сообщение точно ушло — outbox-копия больше не нужна.
      if (threadId) {
        try {
          localStorage.removeItem(`msg_outbox:${threadId}`)
        } catch {
          /* SSR */
        }
      }
      const qk = messagesKey
      queryClient.setQueryData(qk, (old: unknown) => {
        const typed = old as
          | { pages: { messages: ProjectMessage[]; hasMore: boolean }[]; pageParams: unknown[] }
          | undefined
        if (!typed) return typed
        // Убираем оптимистики и дедуплицируем с realtime-версиями (если succeed
        // успел отработать после того, как realtime уже добавил запись).
        const realIds = new Set(result.map((m) => m.id))
        // НЕ понижаем статус доставки. `result` — это версия на момент INSERT
        // (send_status='pending'); edge function проставляет 'sent' асинхронно и
        // присылает realtime-UPDATE, который мог уже долететь и обновить кэш
        // (особенно для email+вложение, где мутация дольше). Если в кэше уже
        // стоит финальный статус — сохраняем его, иначе бабл залипает в
        // «Отправляется», хотя письмо ушло (гонка realtime vs onSuccess).
        const prevById = new Map<string, ProjectMessage>()
        for (const page of typed.pages) {
          for (const msg of page.messages) prevById.set(msg.id, msg)
        }
        const isFinal = (s: string | null | undefined) => s === 'sent' || s === 'failed'
        const merged = result.map((m) => {
          const prev = prevById.get(m.id)
          if (prev && isFinal(prev.send_status) && !isFinal(m.send_status)) {
            return {
              ...m,
              send_status: prev.send_status,
              recipient_read_at: m.recipient_read_at ?? prev.recipient_read_at,
            }
          }
          return m
        })
        const pages = typed.pages.map((page) => ({
          ...page,
          messages: page.messages.filter(
            (msg) => !msg.id.startsWith('optimistic-') && !realIds.has(msg.id),
          ),
        }))
        const lastIdx = pages.length - 1
        pages[lastIdx] = {
          ...pages[lastIdx],
          messages: [...pages[lastIdx].messages, ...merged],
        }
        return { ...typed, pages }
      })
      // Если есть вложения — не рефетчим: вложения могут ещё не успеть записаться в БД,
      // рефетч вернёт сообщение без файлов. Realtime обновит данные когда всё готово.
      const hasFiles =
        (variables.attachments?.length ?? 0) > 0 ||
        (variables.forwardedAttachments?.length ?? 0) > 0
      if (!hasFiles) {
        queryClient.refetchQueries({ queryKey: qk })
      }

      // Dismiss toast notifications for this project
      if (projectId) dismissProjectToasts(projectId)

      // Отправка сообщения = прочитал чат. Оптимистично патчим inbox-кэш
      // (источник «прочитано» для кнопки/бейджа) сразу — как ручная кнопка
      // «Прочитано». markAsRead + инвалидация догоняют сервер фоном.
      if (currentParticipant) {
        patchCachesForMarkRead(queryClient, { threadId, projectId, workspaceId })
        markAsRead(currentParticipant.participantId, projectId, channel, threadId)
          .then(() => {
            invalidateMessengerCaches(queryClient, workspaceId)
          })
          .catch(() => {
            // Не критично — сообщение отправлено, просто markAsRead не удался
          })
      }
    },
  })
}
