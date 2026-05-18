"use client"

/**
 * SidebarGlobalSearch — глобальный поиск + «Недавнее» для сайдбара.
 *
 * - В обычном режиме: строка ввода + dropdown с результатами.
 * - В compact-режиме: иконка лупы → popover с тем же содержимым.
 *
 * Поиск активируется при query.length >= 2 (debounce 250ms). Пока пусто —
 * показывается список недавно открытых элементов.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
  Folder,
  ListChecks,
  MessageSquare,
  Mail,
  BookOpen,
  User,
  Quote,
  Clock,
  Loader2,
  X,
} from 'lucide-react'
import {
  useGlobalSearch,
  useRecentlyViewed,
  useDebouncedValue,
  type GlobalSearchEntityType,
  type GlobalSearchRow,
  type RecentlyViewedRow,
} from '@/hooks/useGlobalSearch'
import { supabase } from '@/lib/supabase'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  workspaceId: string | undefined
  /** В compact-режиме рендерится кнопка-иконка, во full — input. */
  compact?: boolean
}

export function SidebarGlobalSearch({ workspaceId, compact = false }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebouncedValue(query, 250)
  const { data: results, isFetching: isSearching } = useGlobalSearch(workspaceId, debouncedQuery)
  const { data: recent } = useRecentlyViewed(workspaceId, 15)

  const isSearchMode = debouncedQuery.trim().length >= 2
  const hasResults = (results?.length ?? 0) > 0
  const hasRecent = (recent?.length ?? 0) > 0

  const openThread = useCallback(async (threadId: string) => {
    const { data: thread } = await supabase
      .from('project_threads')
      .select(
        'id, name, type, project_id, workspace_id, status_id, deadline, accent_color, icon, is_pinned, created_at, created_by, sort_order',
      )
      .eq('id', threadId)
      .eq('is_deleted', false)
      .maybeSingle()
    if (!thread) return
    globalOpenThread({
      id: thread.id,
      name: thread.name,
      type: (thread.type === 'task' ? 'task' : 'chat') as 'chat' | 'task',
      project_id: thread.project_id,
      workspace_id: thread.workspace_id,
      status_id: thread.status_id,
      deadline: thread.deadline,
      accent_color: thread.accent_color,
      icon: thread.icon,
      is_pinned: thread.is_pinned,
      created_at: thread.created_at,
      created_by: thread.created_by,
      sort_order: thread.sort_order ?? 0,
    })
  }, [])

  const handlePick = useCallback(
    async (item: {
      entity_type: GlobalSearchEntityType
      entity_id: string
      thread_id: string | null
    }) => {
      if (!workspaceId) return
      setIsOpen(false)
      setQuery('')
      const wsPrefix = `/workspaces/${workspaceId}`
      switch (item.entity_type) {
        case 'thread':
          await openThread(item.entity_id)
          break
        case 'message':
          if (item.thread_id) await openThread(item.thread_id)
          break
        case 'project':
          router.push(`${wsPrefix}/projects/${item.entity_id}`)
          break
        case 'knowledge_article':
          router.push(`${wsPrefix}/settings/knowledge-base/${item.entity_id}`)
          break
        case 'participant':
          router.push(`${wsPrefix}/settings/participants`)
          break
      }
    },
    [workspaceId, router, openThread],
  )

  const handleRecentPick = useCallback(
    async (item: RecentlyViewedRow) => {
      await handlePick({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        thread_id: item.entity_type === 'thread' ? item.entity_id : null,
      })
    },
    [handlePick],
  )

  // Группировка результатов поиска по типу — для шапок секций.
  const grouped = useMemo(() => {
    if (!results) return [] as Array<{ type: GlobalSearchEntityType; items: GlobalSearchRow[] }>
    const order: GlobalSearchEntityType[] = ['thread', 'project', 'knowledge_article', 'participant', 'message']
    const byType = new Map<GlobalSearchEntityType, GlobalSearchRow[]>()
    for (const r of results) {
      const list = byType.get(r.entity_type) ?? []
      list.push(r)
      byType.set(r.entity_type, list)
    }
    return order
      .filter((t) => byType.has(t))
      .map((t) => ({ type: t, items: byType.get(t)! }))
  }, [results])

  const dropdown = (
    <div className="flex flex-col max-h-[70vh] overflow-hidden">
      {!isSearchMode ? (
        <RecentSection
          recent={recent ?? []}
          hasRecent={hasRecent}
          onPick={handleRecentPick}
        />
      ) : isSearching && !hasResults ? (
        <div className="px-3 py-6 text-center text-sm text-gray-500 flex items-center justify-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Ищу…
        </div>
      ) : !hasResults ? (
        <div className="px-3 py-6 text-center text-sm text-gray-500">
          Ничего не найдено
        </div>
      ) : (
        <div className="overflow-y-auto">
          {grouped.map((group) => (
            <SearchGroup key={group.type} type={group.type} items={group.items} onPick={handlePick} />
          ))}
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Поиск"
            title="Поиск"
            className="flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 transition-colors"
          >
            <Search size={16} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          className="w-[360px] p-0"
          onOpenAutoFocus={(e) => {
            // Фокус сразу в input
            e.preventDefault()
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          <div className="border-b border-gray-200">
            <SearchInputInline
              value={query}
              onChange={setQuery}
              inputRef={inputRef}
            />
          </div>
          {dropdown}
        </PopoverContent>
      </Popover>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIsOpen(true)
            }}
            onFocus={() => setIsOpen(true)}
            placeholder="Поиск"
            className="w-full h-8 pl-8 pr-7 text-sm bg-white border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {query.length > 0 && (
            <button
              type="button"
              aria-label="Очистить"
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 rounded"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {dropdown}
      </PopoverContent>
    </Popover>
  )
}

function SearchInputInline({
  value,
  onChange,
  inputRef,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div className="relative p-2">
      <Search
        size={14}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
      />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск"
        autoFocus
        className="w-full h-8 pl-7 pr-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
    </div>
  )
}

function RecentSection({
  recent,
  hasRecent,
  onPick,
}: {
  recent: RecentlyViewedRow[]
  hasRecent: boolean
  onPick: (item: RecentlyViewedRow) => void
}) {
  if (!hasRecent) {
    return (
      <div className="px-3 py-6 text-center text-sm text-gray-500">
        <Clock size={16} className="mx-auto mb-2 text-gray-400" />
        Здесь будут недавно открытые
        <div className="text-xs mt-1 text-gray-400">треды, проекты, статьи и контакты</div>
      </div>
    )
  }
  return (
    <div className="overflow-y-auto">
      <SectionHeader icon={<Clock size={12} />} label="Недавнее" />
      <ul>
        {recent.map((r) => (
          <li key={`${r.entity_type}:${r.entity_id}`}>
            <button
              type="button"
              onClick={() => onPick(r)}
              className="w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-gray-100 transition-colors"
            >
              <EntityIcon type={r.entity_type} threadType={r.thread_type} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">{r.title || '—'}</div>
                {r.subtitle && (
                  <div className="text-xs text-gray-500 truncate">{r.subtitle}</div>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SearchGroup({
  type,
  items,
  onPick,
}: {
  type: GlobalSearchEntityType
  items: GlobalSearchRow[]
  onPick: (item: GlobalSearchRow) => void
}) {
  const label = ENTITY_GROUP_LABEL[type]
  return (
    <div>
      <SectionHeader icon={<EntityIcon type={type} threadType={null} muted />} label={label} />
      <ul>
        {items.map((it) => (
          <li key={`${it.entity_type}:${it.entity_id}`}>
            <button
              type="button"
              onClick={() => onPick(it)}
              className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-gray-100 transition-colors"
            >
              <div className="pt-0.5">
                <EntityIcon type={it.entity_type} threadType={it.thread_type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800 truncate">{it.title || '—'}</div>
                {it.subtitle && (
                  <div className="text-xs text-gray-500 truncate">{it.subtitle}</div>
                )}
                {it.snippet && (
                  <div
                    className="text-xs text-gray-500 mt-0.5 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-gray-900 [&_mark]:rounded-sm [&_mark]:px-0.5"
                    dangerouslySetInnerHTML={{ __html: it.snippet }}
                  />
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="px-3 py-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 border-b border-gray-100">
      {icon}
      <span>{label}</span>
    </div>
  )
}

function EntityIcon({
  type,
  threadType,
  muted = false,
}: {
  type: GlobalSearchEntityType
  threadType: string | null
  muted?: boolean
}) {
  const cls = cn('shrink-0', muted ? 'text-gray-400' : 'text-gray-500')
  const size = 14
  if (type === 'thread' || type === 'message') {
    if (threadType === 'task') return <ListChecks size={size} className={cls} />
    if (threadType === 'email') return <Mail size={size} className={cls} />
    return <MessageSquare size={size} className={cls} />
  }
  if (type === 'project') return <Folder size={size} className={cls} />
  if (type === 'knowledge_article') return <BookOpen size={size} className={cls} />
  if (type === 'participant') return <User size={size} className={cls} />
  return <Quote size={size} className={cls} />
}

const ENTITY_GROUP_LABEL: Record<GlobalSearchEntityType, string> = {
  thread: 'Треды',
  project: 'Проекты',
  knowledge_article: 'База знаний',
  participant: 'Контакты',
  message: 'Сообщения',
}
