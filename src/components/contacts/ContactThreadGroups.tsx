"use client"

import { useState, useMemo, createElement } from 'react'
import { Search, X, MessagesSquare, ChevronRight, ChevronDown, Folder } from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { formatTime } from '@/components/messenger/inboxChatItem.helpers'
import { ProjectNamePrefix } from '@/components/shared/ProjectNamePrefix'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ContactThread } from '@/hooks/useContactCard'
import {
  groupContactThreads,
  filterContactThreads,
  type ContactThreadProjectGroup,
} from '@/lib/contacts/contactThreadGrouping'

const MAX_PER_GROUP = 30

/**
 * Список переписок контакта, сгруппированный по проектам (+ личные диалоги),
 * со свёрткой групп, ленивым рендером и поиском. Чистая логика группировки/
 * фильтра — в `@/lib/contacts/contactThreadGrouping`.
 */
export function ThreadGroups({
  threads,
  onOpenThread,
  showPrefixes,
}: {
  threads: ContactThread[]
  onOpenThread: (id: string) => void
  showPrefixes: boolean
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Фильтр по названию треда И проекта — по уже загруженным данным, без доп. запросов.
  const filtered = useMemo(() => filterContactThreads(threads, query), [threads, query])
  const { personal, projects } = useMemo(() => groupContactThreads(filtered), [filtered])

  if (threads.length === 0) {
    return <div className="text-sm text-muted-foreground">Нет переписок</div>
  }

  const showSearch = threads.length > 6

  return (
    <div className="space-y-2">
      {showSearch && (
        <div className="flex items-center gap-2 px-2 py-1 border rounded">
          <Search className="h-3.5 w-3.5 text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Поиск по тредам и проектам"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 text-sm focus:outline-none bg-transparent min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground px-2 py-1">Ничего не найдено</div>
      ) : (
        <div className="space-y-1 max-h-96 overflow-y-auto overflow-x-hidden">
          {personal.length > 0 && (
            <div>
              {projects.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-gray-400">
                  <MessagesSquare className="h-3 w-3" /> Личные диалоги
                </div>
              )}
              <ThreadList threads={personal} onOpenThread={onOpenThread} />
            </div>
          )}
          {projects.map((g) => (
            <ProjectGroup
              key={g.projectId}
              group={g}
              onOpenThread={onOpenThread}
              defaultOpen={projects.length === 1 && personal.length === 0}
              forceOpen={!!q}
              showPrefixes={showPrefixes}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ProjectGroup({
  group,
  onOpenThread,
  defaultOpen,
  forceOpen = false,
  showPrefixes,
}: {
  group: ContactThreadProjectGroup<ContactThread>
  onOpenThread: (id: string) => void
  defaultOpen: boolean
  /** Принудительно раскрыть (при активном поиске — чтобы видеть совпадения). */
  forceOpen?: boolean
  showPrefixes: boolean
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen)
  const open = forceOpen || localOpen
  return (
    <div>
      <button
        type="button"
        onClick={() => setLocalOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        )}
        <Folder className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-900 truncate min-w-0">
            {showPrefixes ? <ProjectNamePrefix prefix={group.namePrefix} /> : null}
            {group.projectName}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
            ({group.threads.length})
          </span>
        </span>
        <span className="text-[11px] text-gray-400 tabular-nums shrink-0 min-w-[42px] text-right">
          {formatTime(group.lastMessageAt)}
        </span>
      </button>
      {open && (
        // pl-10: выравнивает иконку треда под начало НАЗВАНИЯ проекта
        // (после шеврона+папки в заголовке группы), а не под шеврон.
        <div className="pl-10">
          <ThreadList threads={group.threads} onOpenThread={onOpenThread} />
        </div>
      )}
    </div>
  )
}

function ThreadList({
  threads,
  onOpenThread,
}: {
  threads: ContactThread[]
  onOpenThread: (id: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? threads : threads.slice(0, MAX_PER_GROUP)
  return (
    <div className="space-y-0.5">
      {visible.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpenThread(t.id)}
          className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2"
        >
          <span className="shrink-0">
            {createElement(getChatIconComponent(t.icon), {
              className: `w-3.5 h-3.5 ${COLOR_TEXT[t.accent_color as ThreadAccentColor] ?? 'text-blue-500'}`,
            })}
          </span>
          <span className="text-sm text-gray-600 truncate min-w-0 flex-1">{t.name}</span>
          <span className="text-[11px] text-gray-400 tabular-nums shrink-0 min-w-[42px] text-right">
            {formatTime(t.last_message_at)}
          </span>
        </button>
      ))}
      {threads.length > MAX_PER_GROUP && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[11px] text-blue-600 hover:underline px-2 py-1"
        >
          Показать все ({threads.length})
        </button>
      )}
    </div>
  )
}
