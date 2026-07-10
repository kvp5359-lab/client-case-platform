import { useEffect, useMemo } from 'react'
import {
  Search,
  X,
  Paperclip,
  Image as ImageIcon,
  Music,
  Link as LinkIcon,
  MessageSquare,
  LayoutGrid,
  Loader2,
  User,
  ChevronDown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { useThreadSearch, type ThreadSearchFilterKey } from '@/hooks/messenger/useThreadSearch'
import { MessageList } from '../MessageList'
import { ThreadSearchGallery } from './ThreadSearchGallery'
import { pluralRu } from './searchFormat'

const NOOP = () => {}

type ThreadSearchOverlayProps = {
  threadId: string
  threadName?: string | null
  onClose: () => void
  onJump: (messageId: string) => void
}

const FILTER_DEFS: { key: ThreadSearchFilterKey; label: string; Icon: typeof Paperclip }[] = [
  { key: 'images', label: 'Картинки', Icon: ImageIcon },
  { key: 'audio', label: 'Аудио', Icon: Music },
  { key: 'files', label: 'Файлы', Icon: Paperclip },
  { key: 'links', label: 'Ссылки', Icon: LinkIcon },
]

export function ThreadSearchOverlay({
  threadId,
  threadName,
  onClose,
  onJump,
}: ThreadSearchOverlayProps) {
  const s = useThreadSearch(threadId)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const hasResults = s.messages.length > 0
  const filterActive: Record<ThreadSearchFilterKey, boolean> = {
    images: s.filters.wantImages,
    audio: s.filters.wantAudio,
    files: s.filters.wantFiles,
    links: s.filters.wantLinks,
  }
  const selectedSenderName =
    s.senders.find((x) => x.participant_id === s.senderParticipantId)?.name ?? 'Отправитель'

  // Режим «Сообщения» = тот же чат (MessageList): бейджи дат, баблы, вложения —
  // всё переиспользуется. RPC отдаёт desc, ленте нужен хронологический asc.
  const chronoMessages = useMemo(() => [...s.messages].reverse(), [s.messages])

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background">
      {/* Шапка */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Поиск в треде</span>
        {threadName && (
          <span className="truncate text-sm text-muted-foreground/70">· {threadName}</span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть поиск"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Панель управления */}
      <div className="border-b border-border px-3 py-2.5">
        <div className="flex h-9 items-center gap-2 rounded-md border border-border px-2.5">
          <Search className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <input
            value={s.query}
            onChange={(e) => s.setQuery(e.target.value)}
            placeholder="Поиск сообщений…"
            className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          {s.isSearching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        {/* Всё в одну строку: сегмент типов (иконки + адаптивные подписи) ·
            отправитель · переключатель вида. На узкой панели подписи типов
            скрываются (container query .tsf-label), остаются иконки. */}
        <div className="thread-search-filters-cq mt-2.5 flex items-center gap-1.5">
          <div className="flex items-center divide-x divide-border overflow-hidden rounded-md border border-border">
            {FILTER_DEFS.map(({ key, label, Icon }) => {
              const active = filterActive[key]
              return (
                <button
                  key={key}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => s.toggleFilter(key)}
                  aria-pressed={active}
                  className={cn(
                    'flex h-8 items-center justify-center px-2.5 transition-colors',
                    active ? 'bg-brand-100 text-brand-600' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="tsf-label ml-1.5 whitespace-nowrap text-xs">{label}</span>
                </button>
              )
            })}
          </div>

          {/* Фильтр по отправителю — только если в треде больше одного автора. */}
          {s.senders.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  title="Фильтр по отправителю"
                  className={cn(
                    'flex h-8 min-w-0 max-w-[8rem] items-center gap-1 rounded-md border px-2 text-xs transition-colors',
                    s.senderParticipantId
                      ? 'border-brand-100 bg-brand-100 text-brand-600'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{s.senderParticipantId ? selectedSenderName : 'Все'}</span>
                  <ChevronDown className="h-3 w-3 flex-shrink-0 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                <DropdownMenuItem onClick={() => s.setSenderParticipantId(null)}>
                  Все отправители
                </DropdownMenuItem>
                {s.senders.map((x) => (
                  <DropdownMenuItem
                    key={x.participant_id}
                    onClick={() => s.setSenderParticipantId(x.participant_id)}
                  >
                    {x.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="ml-auto flex items-center divide-x divide-border overflow-hidden rounded-md border border-border">
            <ViewBtn
              active={s.view === 'messages'}
              onClick={() => s.setView('messages')}
              Icon={MessageSquare}
              label="Сообщения"
            />
            <ViewBtn
              active={s.view === 'gallery'}
              onClick={() => s.setView('gallery')}
              Icon={LayoutGrid}
              label="Галерея"
            />
          </div>
        </div>

        {/* Разбивка счётчиков */}
        {hasResults && (
          <div className="mt-2 text-xs text-muted-foreground">
            {s.counts.images} {pluralRu(s.counts.images, ['фото', 'фото', 'фото'])} ·{' '}
            {s.counts.audios} аудио ·{' '}
            {s.counts.files} {pluralRu(s.counts.files, ['файл', 'файла', 'файлов'])} ·{' '}
            {s.counts.links} {pluralRu(s.counts.links, ['ссылка', 'ссылки', 'ссылок'])}
          </div>
        )}
      </div>

      {/* Тело. Для «Сообщения» MessageList скроллит сам (свой overflow) —
          обёртка без overflow; для галереи/подсказок — overflow на обёртке. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {!s.shouldSearch ? (
          <EmptyHint text="Введите запрос от 2 символов или выберите фильтр — картинки, аудио, файлы, ссылки." />
        ) : s.isSearching && !hasResults ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !hasResults ? (
          <EmptyHint text="Ничего не найдено." />
        ) : s.view === 'messages' ? (
          // Тот же чат: бейджи дат, разделители, баблы, вложения, реакции.
          <MessageList
            messages={chronoMessages}
            isLoading={false}
            hasMoreOlder={false}
            isFetchingOlder={false}
            onFetchOlder={NOOP}
            auditEvents={[]}
            jumpToMessageId={null}
            suppressUnread
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ThreadSearchGallery
              images={s.images}
              audios={s.audios}
              files={s.files}
              links={s.links}
              threadId={threadId}
              onJump={onJump}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function ViewBtn({
  active,
  onClick,
  Icon,
  label,
}: {
  active: boolean
  onClick: () => void
  Icon: typeof MessageSquare
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'flex h-8 w-9 items-center justify-center transition-colors',
        active ? 'bg-brand-100 text-brand-600' : 'text-muted-foreground hover:bg-muted',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex flex-1 items-center justify-center px-8 py-16 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}
