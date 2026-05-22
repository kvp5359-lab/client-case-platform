import { useRef, useEffect, useCallback, useMemo } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-react'
import { MessageBubble } from './MessageBubble'
import { MessengerEmptyState } from './MessengerEmptyState'
import { useMessengerContext } from './MessengerContext'
import { ServiceMessage } from './ServiceMessage'
import type { ThreadAuditEvent } from '@/hooks/messenger/useThreadAuditEvents'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { useDeleteMessage } from '@/hooks/messenger/useDeleteMessage'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'

interface MessageListProps {
  messages: ProjectMessage[]
  isLoading: boolean
  hasMoreOlder: boolean
  isFetchingOlder: boolean
  lastReadAt?: string
  /**
   * Флаг: запрос last_read_at завершён (данные либо получены, либо явно null).
   * Пока false — не подсвечиваем непрочитанные, чтобы не мигало при первой
   * загрузке страницы (до ответа RPC lastReadAt === undefined).
   */
  isLastReadAtLoaded?: boolean
  onFetchOlder: () => void
  /** Инкрементируется при отправке сообщения — принудительный скролл вниз */
  scrollToBottomTrigger?: number
  /** Audit events to display inline between messages */
  auditEvents?: ThreadAuditEvent[]
  /** ID сообщения, к которому нужно проскроллить (после jump из поиска). */
  jumpToMessageId?: string | null
  /** Коллбек после успешного jump — родитель сбрасывает jumpToMessageId. */
  onJumpComplete?: () => void
  /**
   * Колбек «догрузить старую историю из Telegram через MTProto».
   * Передаётся только для MTProto-тредов (см. MessengerTabContent).
   * Когда `hasMoreOlder === false`, над лентой показывается кнопка
   * «Загрузить ещё из Telegram», по клику зовётся этот колбек.
   * Если не передан — кнопка не рендерится.
   */
  onBackfillFromTelegram?: () => void
  /** Идёт ли сейчас запрос бэкфилла (для дизейбла кнопки и спиннера). */
  isBackfilling?: boolean
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
  messages: rawMessages,
  isLoading,
  hasMoreOlder,
  isFetchingOlder,
  lastReadAt,
  isLastReadAtLoaded = true,
  onFetchOlder,
  scrollToBottomTrigger,
  auditEvents = [],
  jumpToMessageId,
  onJumpComplete,
  onBackfillFromTelegram,
  isBackfilling = false,
}: MessageListProps) {
  const {
    currentParticipantId,
    isAdmin,
    isDelayedPending,
    getDelayedExpiresAt,
    onCancelDelayed,
    currentThreadId,
  } = useMessengerContext()

  // Скрываем оптимистические бабблы, если в кэше уже есть «реальный близнец»
  // (тот же автор + контент + has_attachments в окне ±60 сек). Иначе во время
  // отправки виден визуальный дубль: оптимистический pending и реальный
  // pending/sent одновременно, до того как onSuccess вычистит оптимистики.
  const messages = useMemo(() => {
    const realByKey = new Map<string, string>()
    for (const m of rawMessages) {
      if (m.id.startsWith('optimistic-')) continue
      const key = `${m.sender_participant_id ?? ''}|${m.content}|${m.attachments?.length ? '1' : '0'}`
      const existing = realByKey.get(key)
      if (!existing) realByKey.set(key, m.created_at)
    }
    return rawMessages.filter((m) => {
      if (!m.id.startsWith('optimistic-')) return true
      const key = `${m.sender_participant_id ?? ''}|${m.content}|${m.attachments?.length ? '1' : '0'}`
      const realTs = realByKey.get(key)
      if (!realTs) return true
      const delta = Math.abs(Date.parse(m.created_at) - Date.parse(realTs))
      return delta > 60_000
    })
  }, [rawMessages])
  const { user } = useAuth()
  const currentUserId = user?.id ?? null
  // Для удаления служебных сообщений (TG: добавил/удалил участника).
  // RLS на стороне БД пускает только владельца/edit_all_projects, поэтому
  // здесь достаточно показать кнопку всем admin'ам — попытку без прав
  // отобьёт PostgreSQL и onError useDeleteMessage покажет toast.
  const deleteMutation = useDeleteMessage(currentThreadId ?? '')
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const prevFirstIdRef = useRef<string | null>(null)
  const prevLastIdRef = useRef<string | null>(null)
  const prevMessageCountRef = useRef(0)
  // Sentinel прикрепляется через callback ref (не useRef), потому что при
  // первой загрузке isLoading=true и вместо sentinel рендерится скелетон —
  // sentinel появляется только после перехода isLoading→false. С useRef +
  // useEffect наблюдатель цеплялся к sentinel === null на первом mount и
  // больше не переподключался → бесконечная подгрузка вверх не работала
  // на тредах, где требовалась более одной страницы из БД.
  // Callback ref пересоздаёт observer автоматически когда sentinel-нода
  // появляется/исчезает.
  const observerRef = useRef<IntersectionObserver | null>(null)
  // Высота viewport ДО добавления старых сообщений — нужна для компенсации scrollTop
  const preLoadScrollHeightRef = useRef<number | null>(null)

  const getViewport = useCallback((): HTMLElement | null => {
    return scrollAreaRef.current
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

  // Перемотка к сообщению из результатов поиска.
  // Работает, когда сообщение уже есть в текущем окне; если нет (искомое
  // глубже, чем подгружено) — скроллим к верху и полагаемся на подгрузку
  // older через IntersectionObserver, jumpId остаётся активным и эффект
  // повторно попытается найти ноду после каждого ре-рендера messages.
  useEffect(() => {
    if (!jumpToMessageId) return
    const el = document.getElementById(`msg-${jumpToMessageId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // Подсветка совпадает с той, что у reply-перехода (см. BubbleHeader).
      el.style.backgroundColor = 'rgb(254 243 199)' // amber-100
      el.style.color = 'rgb(180 83 9)' // amber-700
      el.style.boxShadow = 'inset 0 0 0 2px rgb(180 83 9)'
      const t = setTimeout(() => {
        el.style.backgroundColor = ''
        el.style.color = ''
        el.style.boxShadow = ''
        onJumpComplete?.()
      }, 2000)
      return () => clearTimeout(t)
    }
    // Сообщения ещё нет — скроллим вверх, чтобы сработал fetchOlder.
    const viewport = getViewport()
    if (viewport) viewport.scrollTop = 0
  }, [jumpToMessageId, messages, getViewport, onJumpComplete])

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

  const sentinelRef = useCallback(
    (node: HTMLDivElement | null) => {
      // Снимаем старого observer'а (если был).
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
      if (!node) return
      const observer = new IntersectionObserver(
        (entries) => {
          const s = stateRef.current
          if (entries[0]?.isIntersecting && s.hasMoreOlder && !s.isFetchingOlder) {
            // Зафиксировать высоту ДО подгрузки — чтобы компенсировать scrollTop после рендера
            const viewport = getViewport()
            if (viewport) {
              preLoadScrollHeightRef.current = viewport.scrollHeight
            }
            s.onFetchOlder()
          }
        },
        { threshold: 0.1, rootMargin: '200px 0px 0px 0px' },
      )
      observer.observe(node)
      observerRef.current = observer
    },
    [getViewport],
  )

  // Финальный cleanup при unmount компонента.
  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }
    }
  }, [])

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

  // Индекс первого непрочитанного чужого сообщения — разделитель показывается ровно 1 раз.
  // Сравниваем через Date.parse — Postgres timestamptz может приходить в разных
  // форматах (с T или с пробелом, с микросекундами или без), string-compare даёт сюрпризы.
  const lastReadAtMs = useMemo(() => (lastReadAt ? Date.parse(lastReadAt) : null), [lastReadAt])
  const firstUnreadIndex = useMemo(() => {
    if (lastReadAtMs === null) return -1
    return messages.findIndex(
      (m) => Date.parse(m.created_at) > lastReadAtMs && m.sender_participant_id !== currentParticipantId,
    )
  }, [messages, lastReadAtMs, currentParticipantId])

  // Build a set of audit event timestamps to insert between messages
  // Each event maps to: insert AFTER the last message with created_at <= event.created_at
  type TimelineItem =
    | { kind: 'message'; msg: ProjectMessage; idx: number }
    | { kind: 'event'; event: ThreadAuditEvent }

  const timeline = useMemo<TimelineItem[]>(() => {
    if (auditEvents.length === 0) return messages.map((msg, idx) => ({ kind: 'message' as const, msg, idx }))

    const items: TimelineItem[] = []
    let ei = 0
    for (let mi = 0; mi < messages.length; mi++) {
      // Insert events that happened before this message
      while (ei < auditEvents.length && auditEvents[ei].created_at <= messages[mi].created_at) {
        items.push({ kind: 'event', event: auditEvents[ei] })
        ei++
      }
      items.push({ kind: 'message', msg: messages[mi], idx: mi })
    }
    // Remaining events after last message
    while (ei < auditEvents.length) {
      items.push({ kind: 'event', event: auditEvents[ei] })
      ei++
    }
    return items
  }, [messages, auditEvents])

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

  if (messages.length === 0 && auditEvents.length === 0) {
    return <MessengerEmptyState />
  }

  return (
    <div className="flex-1 messenger-scroll-area relative overflow-y-auto" ref={scrollAreaRef}>
      {/* Loader подгрузки — абсолютное позиционирование, чтобы не влиять на scrollHeight */}
      {isFetchingOlder && (
        <div className="absolute top-2 left-0 right-0 z-10 flex justify-center pointer-events-none">
          <div className="bg-background/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}
      <div className="p-4 pb-8 space-y-2" onCopy={handleCopy}>
        {/* Sentinel для подгрузки старых */}
        <div ref={sentinelRef} className="h-1" />

        {/*
          Кнопка догрузки из Telegram через MTProto. Показывается, когда
          в БД больше нечего листать (hasMoreOlder=false) и тред — MTProto
          (родитель передал onBackfillFromTelegram). По клику mtproto-service
          через gramjs `messages.GetHistory` подтянет 50 старых сообщений
          в БД, после чего InfiniteQuery перезапросит ленту.
        */}
        {!hasMoreOlder && !isLoading && onBackfillFromTelegram && messages.length > 0 && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={onBackfillFromTelegram}
              disabled={isBackfilling}
              className={cn(
                'text-xs px-3 py-1.5 rounded-full border border-border bg-muted/40',
                'hover:bg-muted/70 transition-colors',
                'disabled:opacity-60 disabled:cursor-not-allowed',
                'flex items-center gap-2',
              )}
            >
              {isBackfilling && <Loader2 className="h-3 w-3 animate-spin" />}
              {isBackfilling ? 'Загружаю…' : 'Загрузить ещё 50 из Telegram'}
            </button>
          </div>
        )}

        {timeline.map((item, _ti) => {
          if (item.kind === 'event') {
            // Если last_read_at отсутствует — тред никогда не открывался, все чужие события непрочитанные.
            // Пока lastReadAt ещё грузится (isLastReadAtLoaded=false) — не подсвечиваем, чтобы не мигало.
            const eventIsUnread =
              isLastReadAtLoaded &&
              item.event.user_id !== currentUserId &&
              (lastReadAtMs === null || Date.parse(item.event.created_at) > lastReadAtMs)
            return (
              <ServiceMessage
                key={`event-${item.event.id}`}
                event={item.event}
                isUnread={eventIsUnread}
              />
            )
          }

          const { msg, idx: i } = item
          const showDate = i === 0 || !isSameDay(messages[i - 1].created_at, msg.created_at)
          const isOwn = currentParticipantId
            ? msg.sender_participant_id === currentParticipantId
            : false

          const showUnreadSeparator = i === firstUnreadIndex
          // Если last_read_at отсутствует — тред никогда не открывался, все чужие сообщения непрочитанные.
          // Пока lastReadAt ещё грузится (isLastReadAtLoaded=false) — не подсвечиваем, чтобы не мигало.
          const isUnread =
            isLastReadAtLoaded &&
            !isOwn &&
            msg.sender_participant_id !== currentParticipantId &&
            (lastReadAtMs === null || Date.parse(msg.created_at) > lastReadAtMs)

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
              {msg.source === 'telegram_service' || msg.source === 'bot_event' ? (
                <ServiceMessage
                  text={msg.content}
                  time={msg.created_at}
                  messageId={msg.id}
                  canDelete={isAdmin && !!currentThreadId}
                  onDelete={(id) => deleteMutation.mutateAsync(id)}
                />
              ) : (
                <MessageBubble
                  message={msg}
                  isOwn={isOwn}
                  showAvatar={isFirstInGroup}
                  canDelete={isOwn || isAdmin}
                  isDelayedPending={isDelayedPending?.(msg.id)}
                  delayedExpiresAt={getDelayedExpiresAt?.(msg.id) ?? undefined}
                  onCancelDelayed={onCancelDelayed}
                  isUnread={isUnread}
                  lastReadAt={lastReadAt}
                />
              )}
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
