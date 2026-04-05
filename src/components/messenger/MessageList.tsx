import { useRef, useEffect, useCallback, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'
import { MessageBubble, type MessengerAccent } from './MessageBubble'
import { ChatEmptyState } from './ChatEmptyState'
import type { ProjectMessage, MessageChannel } from '@/services/api/messengerService'

interface MessageListProps {
  messages: ProjectMessage[]
  isLoading: boolean
  hasMoreOlder: boolean
  isFetchingOlder: boolean
  currentParticipantId: string | null
  viewerRole?: string | null
  accent?: MessengerAccent
  lastReadAt?: string
  projectId?: string
  workspaceId?: string
  onFetchOlder: () => void
  onReply: (msg: ProjectMessage) => void
  onReact: (messageId: string, emoji: string) => void
  onEdit?: (msg: ProjectMessage) => void
  onDelete?: (messageId: string) => void
  isAdmin?: boolean
  onQuote?: (text: string) => void
  onForward?: (msg: ProjectMessage) => void
  onPublishDraft?: (msg: ProjectMessage) => void
  onEditDraft?: (msg: ProjectMessage) => void
  channel?: MessageChannel
  isTelegramLinked?: boolean
  isDelayedPending?: (messageId: string) => boolean
  getDelayedExpiresAt?: (messageId: string) => number | null
  onCancelDelayed?: (messageId: string) => void
  /** Инкрементируется при отправке сообщения — принудительный скролл вниз */
  scrollToBottomTrigger?: number
}

/** Разделитель дат */
function DateSeparator({ date }: { date: string }) {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  let label: string
  if (d.toDateString() === today.toDateString()) {
    label = 'Сегодня'
  } else if (d.toDateString() === yesterday.toDateString()) {
    label = 'Вчера'
  } else {
    label = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  return (
    <div className="flex justify-center py-3">
      <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
        {label}
      </span>
    </div>
  )
}

/** Сервисное сообщение Telegram (создание группы, добавление участников и т.д.) */
function ServiceMessage({ text, time }: { text: string; time: string }) {
  const d = new Date(time)
  const timeStr = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="flex justify-center py-1">
      <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
        {text} · {timeStr}
      </span>
    </div>
  )
}

/** Разделитель непрочитанных */
function UnreadSeparator() {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 border-t border-red-400" />
      <span className="text-xs font-medium text-red-500">Непрочитанные</span>
      <div className="flex-1 border-t border-red-400" />
    </div>
  )
}

function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

export function MessageList({
  messages,
  isLoading,
  hasMoreOlder,
  isFetchingOlder,
  currentParticipantId,
  viewerRole,
  accent,
  lastReadAt,
  onFetchOlder,
  onReply,
  onReact,
  onEdit,
  onDelete,
  isAdmin,
  onQuote,
  onForward,
  onPublishDraft,
  onEditDraft,
  channel,
  projectId,
  workspaceId,
  isTelegramLinked,
  isDelayedPending,
  getDelayedExpiresAt,
  onCancelDelayed,
  scrollToBottomTrigger,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const prevFirstIdRef = useRef<string | null>(null)
  const prevLastIdRef = useRef<string | null>(null)
  const prevMessageCountRef = useRef(0)
  const sentinelRef = useRef<HTMLDivElement>(null)
  // Высота viewport ДО добавления старых сообщений — нужна для компенсации scrollTop
  const preLoadScrollHeightRef = useRef<number | null>(null)

  const getViewport = useCallback((): HTMLElement | null => {
    return (
      scrollAreaRef.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null
    )
  }, [])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const viewport = getViewport()
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior })
      }
    },
    [getViewport],
  )

  // Автоскролл/сохранение позиции — отличаем добавление снизу (новые) от добавления сверху (старые)
  useEffect(() => {
    const firstId = messages[0]?.id ?? null
    const lastId = messages[messages.length - 1]?.id ?? null
    const prevFirstId = prevFirstIdRef.current
    const prevLastId = prevLastIdRef.current
    const isFirstLoad = prevMessageCountRef.current === 0 && messages.length > 0

    if (isFirstLoad) {
      // Первая загрузка — мгновенно вниз
      requestAnimationFrame(() => scrollToBottom('instant'))
    } else if (prevFirstId && firstId !== prevFirstId && prevLastId === lastId) {
      // Добавлены старые сверху (first изменился, last тот же) — компенсируем scrollTop
      const viewport = getViewport()
      const prevHeight = preLoadScrollHeightRef.current
      if (viewport && prevHeight != null) {
        const delta = viewport.scrollHeight - prevHeight
        if (delta > 0) {
          viewport.scrollTop = viewport.scrollTop + delta
        }
      }
      preLoadScrollHeightRef.current = null
    } else if (prevLastId && lastId !== prevLastId) {
      // Добавлены новые снизу (last изменился) — плавный скролл вниз
      requestAnimationFrame(() => scrollToBottom('smooth'))
    }

    prevFirstIdRef.current = firstId
    prevLastIdRef.current = lastId
    prevMessageCountRef.current = messages.length
  }, [messages, currentParticipantId, scrollToBottom, getViewport])

  // Принудительный скролл вниз при отправке сообщения
  useEffect(() => {
    if (scrollToBottomTrigger && scrollToBottomTrigger > 0) {
      // Несколько попыток: сразу, после рендера, и с задержками (для refetch после INSERT)
      requestAnimationFrame(() => scrollToBottom('smooth'))
      const t1 = setTimeout(() => scrollToBottom('smooth'), 300)
      const t2 = setTimeout(() => scrollToBottom('smooth'), 800)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [scrollToBottomTrigger, scrollToBottom])

  // IntersectionObserver для подгрузки старых сообщений.
  // Состояние читаем через refs, чтобы observer создавался один раз и не пересоздавался
  // при каждом изменении hasMoreOlder/isFetchingOlder — иначе в момент пересоздания новый
  // observer мгновенно вызывает callback (sentinel всё ещё видим) и возникает цикл,
  // вызывающий ре-рендеры и визуальное дрожание чата.
  const stateRef = useRef({ hasMoreOlder, isFetchingOlder, onFetchOlder })
  useEffect(() => {
    stateRef.current = { hasMoreOlder, isFetchingOlder, onFetchOlder }
  }, [hasMoreOlder, isFetchingOlder, onFetchOlder])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const s = stateRef.current
        const isIntersecting = entries[0]?.isIntersecting
        // DEBUG: логи для диагностики подгрузки старых сообщений
        console.log('[MessageList] observer', {
          isIntersecting,
          hasMoreOlder: s.hasMoreOlder,
          isFetchingOlder: s.isFetchingOlder,
        })
        if (isIntersecting && s.hasMoreOlder && !s.isFetchingOlder) {
          // Зафиксировать высоту ДО подгрузки — чтобы компенсировать scrollTop после рендера
          const viewport = getViewport()
          if (viewport) {
            preLoadScrollHeightRef.current = viewport.scrollHeight
          }
          console.log('[MessageList] → fetchOlder()')
          s.onFetchOlder()
        }
      },
      { threshold: 0.1, rootMargin: '200px 0px 0px 0px' },
    )
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [getViewport])

  // Strip background-color from copied HTML so bubble colors don't leak into paste
  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const container = document.createElement('div')
    for (let i = 0; i < selection.rangeCount; i++) {
      container.appendChild(selection.getRangeAt(i).cloneContents())
    }
    const html = container.innerHTML
    if (!html) return

    // Remove background/background-color from inline styles
    const cleaned = html.replace(/\s*background(?:-color)?\s*:\s*[^;"']+;?/gi, '')

    e.clipboardData.setData('text/html', cleaned)
    e.clipboardData.setData('text/plain', selection.toString())
    e.preventDefault()
  }, [])

  // Индекс первого непрочитанного чужого сообщения — разделитель показывается ровно 1 раз
  const firstUnreadIndex = useMemo(() => {
    if (!lastReadAt) return -1
    return messages.findIndex(
      (m) => m.created_at > lastReadAt && m.sender_participant_id !== currentParticipantId,
    )
  }, [messages, lastReadAt, currentParticipantId])

  if (isLoading) {
    return (
      <div className="flex-1 p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
            <Skeleton className="h-16 w-48 rounded-2xl" />
          </div>
        ))}
      </div>
    )
  }

  if (messages.length === 0) {
    return <ChatEmptyState />
  }

  return (
    <ScrollArea className="flex-1 messenger-scroll-area relative" ref={scrollAreaRef}>
      {/* Loader подгрузки — абсолютное позиционирование, чтобы не влиять на scrollHeight */}
      {isFetchingOlder && (
        <div className="absolute top-2 left-0 right-0 z-10 flex justify-center pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}
      <div className="p-4 space-y-2" onCopy={handleCopy}>
        {/* Sentinel для подгрузки старых */}
        <div ref={sentinelRef} className="h-1" />

        {messages.map((msg, i) => {
          const showDate = i === 0 || !isSameDay(messages[i - 1].created_at, msg.created_at)
          const isOwn = currentParticipantId
            ? msg.sender_participant_id === currentParticipantId
            : false

          const showUnreadSeparator = i === firstUnreadIndex

          // Показывать аватарку только для первого сообщения в группе от одного автора
          const prevMsg = messages[i - 1]
          const isSameSender = prevMsg
            ? prevMsg.sender_participant_id && msg.sender_participant_id
              ? prevMsg.sender_participant_id === msg.sender_participant_id
              : prevMsg.sender_name === msg.sender_name
            : false
          const isFirstInGroup =
            !prevMsg || !isSameSender || !isSameDay(msg.created_at, prevMsg.created_at)

          return (
            <div key={msg.id}>
              {showDate && <DateSeparator date={msg.created_at} />}
              {showUnreadSeparator && <UnreadSeparator />}
              {msg.source === 'telegram_service' ? (
                <ServiceMessage text={msg.content} time={msg.created_at} />
              ) : (
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  currentParticipantId={currentParticipantId}
                  accent={accent}
                  showAvatar={isFirstInGroup}
                  viewerRole={viewerRole}
                  onReply={onReply}
                  onReact={onReact}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  canDelete={isOwn || isAdmin}
                  onQuote={onQuote}
                  onForward={onForward}
                  onPublishDraft={onPublishDraft}
                  onEditDraft={onEditDraft}
                  channel={channel}
                  projectId={projectId}
                  workspaceId={workspaceId}
                  isTelegramLinked={isTelegramLinked}
                  isDelayedPending={isDelayedPending?.(msg.id)}
                  delayedExpiresAt={getDelayedExpiresAt?.(msg.id) ?? undefined}
                  onCancelDelayed={onCancelDelayed ? () => onCancelDelayed(msg.id) : undefined}
                />
              )}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
