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

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Clock, Loader2, X } from 'lucide-react'
import {
  useGlobalSearch,
  useRecentlyViewed,
  useProjectIconResolver,
  useProjectPrefixResolver,
  type GlobalSearchEntityType,
} from '@/hooks/useGlobalSearch'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { supabase } from '@/lib/supabase'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { knowledgeArticleHref, projectHref, threadHref, entityLinkClickHandlers } from '@/lib/entityLinks'
import { useThreadNameResolver } from '@/hooks/useThreadUserNames'
import { formatTime } from '@/utils/format/dateFormat'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  SearchInputInline,
  SectionHeader,
  EntityIcon,
  ENTITY_GROUP_LABEL,
} from './search-parts'

type Props = {
  workspaceId: string | undefined
  /** В compact-режиме рендерится кнопка-иконка, во full — input. */
  compact?: boolean
  /** Переопределить классы compact-кнопки-триггера (для подгонки под соседей,
   *  напр. ячейку нижней навигации). Если задан — заменяет дефолтные. */
  triggerClassName?: string
  /** Размер иконки лупы в compact-режиме (по умолчанию 16). */
  iconSize?: number
  /** Элемент, вставляемый внутрь поля поиска справа (full-режим), когда строка
   *  пуста — например кнопка «Избранное». */
  trailing?: ReactNode
}

/** Унифицированный row для рендера (recent + search). */
type DisplayRow = {
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
  /** project_id треда/сообщения (null для личных диалогов). Нужен для построения href. */
  project_id: string | null
  accent_color: string | null
  project_template_id: string | null
  project_status_id: string | null
  /** Иконка треда (project_threads.icon) — для иконки канала. */
  thread_icon: string | null
  /** Когда объект открывали (только у «Недавнего»; у поисковых строк null). */
  opened_at: string | null
}

/** URL для open-in-new-tab. Возвращает null, если для типа нет осмысленной ссылки. */
function hrefForRow(row: DisplayRow, workspaceId: string): string | null {
  switch (row.entity_type) {
    case 'thread':
    case 'message':
      return threadHref(workspaceId, row.thread_id ?? row.entity_id, row.project_id)
    case 'project':
      return projectHref(workspaceId, row.entity_id)
    case 'knowledge_article':
      return knowledgeArticleHref(workspaceId, row.entity_id)
    case 'participant':
      return `/workspaces/${workspaceId}/settings/participants`
  }
}

export function SidebarGlobalSearch({
  workspaceId,
  compact = false,
  triggerClassName,
  iconSize = 16,
  trailing,
}: Props) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const resolveThreadName = useThreadNameResolver()
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const debouncedQuery = useDebounce(query, 250)
  const { data: results, isFetching: isSearching } = useGlobalSearch(workspaceId, debouncedQuery)
  const { data: recent } = useRecentlyViewed(workspaceId, 15)
  const resolveProjectIcon = useProjectIconResolver(workspaceId)
  const resolveProjectPrefix = useProjectPrefixResolver(workspaceId)

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
          router.push(`${wsPrefix}/knowledge-base/${row.entity_id}`)
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
      project_id: r.project_id,
      accent_color: r.accent_color,
      project_template_id: r.project_template_id,
      project_status_id: r.project_status_id,
      thread_icon: r.thread_icon,
      opened_at: r.opened_at,
    }))
  }, [recent])

  // Поисковые результаты, разбитые на «из недавнего» и «остальные»,
  // плюс группировка остальных по типу.
  const searchSections = useMemo(() => {
    if (!results) return { fromRecent: [] as DisplayRow[], groups: [] as Array<{ type: GlobalSearchEntityType; items: DisplayRow[] }> }
    // key → когда открывали: поисковые строки «из недавнего» тоже получают время.
    const recentOpenedAt = new Map(recentRows.map((r) => [r.key, r.opened_at]))
    const recentKeys = new Set(recentOpenedAt.keys())
    const rows: DisplayRow[] = results.map((r) => ({
      key: `${r.entity_type}:${r.entity_id}`,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      title: r.title,
      subtitle: r.subtitle,
      snippet: r.snippet,
      thread_type: r.thread_type,
      thread_id: r.thread_id,
      project_id: r.project_id,
      accent_color: r.accent_color,
      project_template_id: r.project_template_id,
      project_status_id: r.project_status_id,
      thread_icon: r.thread_icon,
      opened_at: recentOpenedAt.get(`${r.entity_type}:${r.entity_id}`) ?? null,
    }))
    const fromRecent = rows.filter((r) => recentKeys.has(r.key))
    const rest = rows.filter((r) => !recentKeys.has(r.key))
    const order: GlobalSearchEntityType[] = ['project', 'thread', 'knowledge_article', 'participant', 'message']
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
    (row: DisplayRow) => {
      // Рендерим <a href> вместо <button>, чтобы браузер нативно открывал в новой
      // вкладке по middle-click / Cmd+ЛКМ / Ctrl+ЛКМ / контекстному меню.
      // Обычный левый клик перехватываем и зовём handlePick (открытие в панели справа,
      // без перехода). Если зажат модификатор или это не основная кнопка — отпускаем
      // дефолт, чтобы новая вкладка открылась.
      const href = workspaceId ? hrefForRow(row, workspaceId) : null
      return (
        <li key={row.key}>
          <a
            href={href ?? undefined}
            {...entityLinkClickHandlers(() => handlePick(row))}
            className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-gray-100 transition-colors no-underline text-inherit"
          >
            <div className="pt-0.5">
              <EntityIcon
                type={row.entity_type}
                threadType={row.thread_type}
                threadIcon={row.thread_icon}
                accentColor={row.accent_color}
                projectTemplateId={row.project_template_id}
                projectStatusId={row.project_status_id}
                resolveProjectIcon={resolveProjectIcon}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-gray-800 truncate">
                {row.entity_type === 'project' &&
                  resolveProjectPrefix(row.project_template_id) && (
                    <span className="text-gray-400 font-normal">
                      {resolveProjectPrefix(row.project_template_id)}{' '}
                    </span>
                  )}
                <span>
                  {row.entity_type === 'thread' && row.thread_id
                    ? resolveThreadName(row.thread_id, row.title || '—')
                    : row.title || '—'}
                </span>
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
            {/* Когда открывали (только у «Недавнего») — формат как во «Входящих»:
                сегодня → ЧЧ:ММ, вчера → «вчера», раньше → короткая дата. */}
            {row.opened_at && (
              <span className="shrink-0 pt-0.5 text-[11px] text-gray-400">
                {formatTime(row.opened_at)}
              </span>
            )}
          </a>
        </li>
      )
    },
    [handlePick, resolveProjectIcon, resolveProjectPrefix, workspaceId, resolveThreadName],
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
            <SectionHeader icon={<Clock size={12} />} label="Недавнее" first />
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
              <SectionHeader icon={<Clock size={12} />} label="Недавнее" first />
              <ul>{searchSections.fromRecent.map(rowFor)}</ul>
            </>
          )}
          {searchSections.groups.map((group, i) => (
            <div key={group.type}>
              <SectionHeader
                first={searchSections.fromRecent.length === 0 && i === 0}
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
            className={
              triggerClassName ??
              'flex items-center justify-center h-8 w-8 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-200/70 transition-colors'
            }
          >
            <Search size={iconSize} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="w-[min(440px,calc(100vw-16px))] p-0"
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
            className="w-full h-8 pl-8 pr-14 text-sm bg-white border border-gray-200 rounded-md text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {query.length > 0 ? (
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
          ) : (
            trailing && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2">{trailing}</div>
            )
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

