"use client"

/**
 * SidebarGlobalSearch — глобальный поиск + «Недавнее» для сайдбара.
 *
 * - В обычном режиме: строка ввода + dropdown с результатами.
 * - В compact-режиме: иконка лупы → popover с тем же содержимым.
 *
 * Поиск активируется при query.length >= 2 (debounce 250ms). Пока пусто —
 * показывается список недавно открытых элементов.
 *
 * Иконки проектов резолвятся через тот же путь, что в WorkspaceSidebar
 * (template.icon + status/fixed color), так что выглядят одинаково с
 * сайдбарным списком проектов.
 */

import { createElement, useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search,
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
  useProjectIconResolver,
  type GlobalSearchEntityType,
} from '@/hooks/useGlobalSearch'
import { supabase } from '@/lib/supabase'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { getProjectIcon } from '@/components/ui/project-icons'
import { safeCssColor } from '@/utils/isValidCssColor'
import { cn } from '@/lib/utils'

interface Props {
  workspaceId: string | undefined
  /** В compact-режиме рендерится кнопка-иконка, во full — input. */
  compact?: boolean
}

/** Унифицированный row для рендера (recent + search). */
interface DisplayRow {
  /** Стабильный ключ. */
  key: string
  entity_type: GlobalSearchEntityType
  entity_id: string
  title: string | null
  /** Имя проекта (для треда/сообщения) или email/phone (для контакта). */
  subtitle: string | null
  /** ts_headline для message/article — рендерится отдельной строкой под title. */
  snippet: string | null
  thread_type: string | null
  thread_id: string | null
  accent_color: string | null
  project_template_id: string | null
  project_status_id: string | null
}

export function SidebarGlobalSearch({ workspaceId, compact = false }: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebouncedValue(query, 250)
  const { data: results, isFetching: isSearching } = useGlobalSearch(workspaceId, debouncedQuery)
  const { data: recent } = useRecentlyViewed(workspaceId, 15)
  const resolveProjectIcon = useProjectIconResolver(workspaceId)

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
    async (row: DisplayRow) => {
      if (!workspaceId) return
      setIsOpen(false)
      setQuery('')
      const wsPrefix = `/workspaces/${workspaceId}`
      switch (row.entity_type) {
        case 'thread':
          await openThread(row.entity_id)
          break
        case 'message':
          if (row.thread_id) await openThread(row.thread_id)
          break
        case 'project':
          router.push(`${wsPrefix}/projects/${row.entity_id}`)
          break
        case 'knowledge_article':
          router.push(`${wsPrefix}/settings/knowledge-base/${row.entity_id}`)
          break
        case 'participant':
          router.push(`${wsPrefix}/settings/participants`)
          break
      }
    },
    [workspaceId, router, openThread],
  )

  // Преобразование recent → DisplayRow.
  const recentRows: DisplayRow[] = useMemo(() => {
    if (!recent) return []
    return recent.map((r) => ({
      key: `${r.entity_type}:${r.entity_id}`,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      title: r.title,
      subtitle: r.subtitle,
      snippet: null,
      thread_type: r.thread_type,
      thread_id: r.entity_type === 'thread' ? r.entity_id : null,
      accent_color: r.accent_color,
      project_template_id: r.project_template_id,
      project_status_id: r.project_status_id,
    }))
  }, [recent])

  // Поисковые результаты, разбитые на «из недавнего» и «остальные»,
  // плюс группировка остальных по типу.
  const searchSections = useMemo(() => {
    if (!results) return { fromRecent: [] as DisplayRow[], groups: [] as Array<{ type: GlobalSearchEntityType; items: DisplayRow[] }> }
    const recentKeys = new Set(recentRows.map((r) => r.key))
    const rows: DisplayRow[] = results.map((r) => ({
      key: `${r.entity_type}:${r.entity_id}`,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      title: r.title,
      subtitle: r.subtitle,
      snippet: r.snippet,
      thread_type: r.thread_type,
      thread_id: r.thread_id,
      accent_color: r.accent_color,
      project_template_id: r.project_template_id,
      project_status_id: r.project_status_id,
    }))
    const fromRecent = rows.filter((r) => recentKeys.has(r.key))
    const rest = rows.filter((r) => !recentKeys.has(r.key))
    const order: GlobalSearchEntityType[] = ['thread', 'project', 'knowledge_article', 'participant', 'message']
    const byType = new Map<GlobalSearchEntityType, DisplayRow[]>()
    for (const r of rest) {
      const list = byType.get(r.entity_type) ?? []
      list.push(r)
      byType.set(r.entity_type, list)
    }
    const groups = order
      .filter((t) => byType.has(t))
      .map((t) => ({ type: t, items: byType.get(t)! }))
    return { fromRecent, groups }
  }, [results, recentRows])

  const rowFor = useCallback(
    (row: DisplayRow) => (
      <li key={row.key}>
        <button
          type="button"
          onClick={() => handlePick(row)}
          className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-gray-100 transition-colors"
        >
          <div className="pt-0.5">
            <EntityIcon
              type={row.entity_type}
              threadType={row.thread_type}
              accentColor={row.accent_color}
              projectTemplateId={row.project_template_id}
              projectStatusId={row.project_status_id}
              resolveProjectIcon={resolveProjectIcon}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-gray-800 truncate">
              <span>{row.title || '—'}</span>
              {row.subtitle && (
                <span className="text-gray-400 ml-2 font-normal">{row.subtitle}</span>
              )}
            </div>
            {row.snippet && (
              <div
                className="text-xs text-gray-500 mt-0.5 line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-gray-900 [&_mark]:rounded-sm [&_mark]:px-0.5"
                dangerouslySetInnerHTML={{ __html: row.snippet }}
              />
            )}
          </div>
        </button>
      </li>
    ),
    [handlePick, resolveProjectIcon],
  )

  const dropdown = (
    <div className="flex flex-col max-h-[70vh] overflow-hidden">
      {!isSearchMode ? (
        !hasRecent ? (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            <Clock size={16} className="mx-auto mb-2 text-gray-400" />
            Здесь будут недавно открытые
            <div className="text-xs mt-1 text-gray-400">треды, проекты, статьи и контакты</div>
          </div>
        ) : (
          <div className="overflow-y-auto">
            <SectionHeader icon={<Clock size={12} />} label="Недавнее" />
            <ul>{recentRows.map(rowFor)}</ul>
          </div>
        )
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
          {searchSections.fromRecent.length > 0 && (
            <>
              <SectionHeader icon={<Clock size={12} />} label="Недавнее" />
              <ul>{searchSections.fromRecent.map(rowFor)}</ul>
              {searchSections.groups.length > 0 && (
                <div className="h-px bg-gray-200" />
              )}
            </>
          )}
          {searchSections.groups.map((group) => (
            <div key={group.type}>
              <SectionHeader
                icon={
                  <EntityIcon
                    type={group.type}
                    threadType={null}
                    accentColor={null}
                    projectTemplateId={null}
                    projectStatusId={null}
                    resolveProjectIcon={resolveProjectIcon}
                    muted
                  />
                }
                label={ENTITY_GROUP_LABEL[group.type]}
              />
              <ul>{group.items.map(rowFor)}</ul>
            </div>
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
          className="w-[440px] p-0"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            setTimeout(() => inputRef.current?.focus(), 0)
          }}
        >
          <div className="border-b border-gray-200">
            <SearchInputInline
              value={query}
              onChange={setQuery}
              inputRef={inputRef}
              onSubmit={() => {
                if (!workspaceId || query.trim().length < 2) return
                setIsOpen(false)
                router.push(
                  `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}`,
                )
                setQuery('')
              }}
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && workspaceId && query.trim().length >= 2) {
                e.preventDefault()
                setIsOpen(false)
                inputRef.current?.blur()
                router.push(
                  `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}`,
                )
                setQuery('')
              }
            }}
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
        className="w-[440px] max-w-[calc(100vw-32px)] p-0"
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
  onSubmit,
}: {
  value: string
  onChange: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onSubmit?: () => void
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onSubmit) {
            e.preventDefault()
            onSubmit()
          }
        }}
        placeholder="Поиск"
        autoFocus
        className="w-full h-8 pl-7 pr-2 text-sm bg-gray-50 border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
      />
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

type ProjectIconResolver = (templateId: string | null, statusId: string | null) => {
  iconId: string | null
  iconColor: string
}

function EntityIcon({
  type,
  threadType,
  accentColor,
  projectTemplateId,
  projectStatusId,
  resolveProjectIcon,
  muted = false,
}: {
  type: GlobalSearchEntityType
  threadType: string | null
  accentColor: string | null
  projectTemplateId: string | null
  projectStatusId: string | null
  resolveProjectIcon: ProjectIconResolver
  muted?: boolean
}) {
  const size = 14

  // Проект — иконка/цвет как в сайдбаре (template.icon + status/fixed color).
  if (type === 'project' && !muted) {
    const { iconId, iconColor } = resolveProjectIcon(projectTemplateId, projectStatusId)
    return createElement(getProjectIcon(iconId), {
      size,
      className: 'shrink-0',
      style: { color: safeCssColor(iconColor || '#6B7280') },
    })
  }

  // accent_color у тредов — семантический ключ Tailwind-палитры
  // ('slate', 'violet', 'rose' …), не CSS-цвет. Резолвим через COLOR_TEXT.
  const useAccent = !muted && accentColor && (type === 'thread' || type === 'message')
  const accentClass = useAccent ? COLOR_TEXT[accentColor!] ?? 'text-gray-500' : null
  const cls = cn(
    'shrink-0',
    accentClass ?? (muted ? 'text-gray-400' : 'text-gray-500'),
  )

  if (type === 'thread' || type === 'message') {
    if (threadType === 'task') return <ListChecks size={size} className={cls} />
    if (threadType === 'email') return <Mail size={size} className={cls} />
    return <MessageSquare size={size} className={cls} />
  }
  if (type === 'project') {
    // muted (для шапки секции «Проекты») — без template, ставим базовую папку с серым.
    return createElement(getProjectIcon(null), { size, className: cls })
  }
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
