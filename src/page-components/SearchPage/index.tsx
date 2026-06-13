"use client"

/**
 * SearchPage — полноценная страница поиска.
 *
 * Открывается:
 * - Кнопкой Enter в строке поиска сайдбара
 * - Прямой ссылкой `/workspaces/[id]/search?q=…`
 *
 * Отличия от popover в сайдбаре:
 * - лимит результатов на тип = 40 (вместо 8)
 * - просторный layout: 2 колонки на больших экранах
 * - сниппеты не обрезаются до 2 строк
 */

import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { Search, X, ListChecks, Mail, MessageSquare, BookOpen, User, Quote } from 'lucide-react'
import { PageLoader } from '@/components/ui/loaders'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import {
  useGlobalSearch,
  useProjectIconResolver,
  type GlobalSearchEntityType,
  type GlobalSearchRow,
} from '@/hooks/useGlobalSearch'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { openThreadById } from '@/components/tasks/openThreadById'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { getProjectIcon } from '@/components/common/project-icons'
import { safeCssColor } from '@/utils/isValidCssColor'
import { cn } from '@/lib/utils'

const ENTITY_GROUP_LABEL: Record<GlobalSearchEntityType, string> = {
  thread: 'Треды',
  project: 'Проекты',
  knowledge_article: 'База знаний',
  participant: 'Контакты',
  message: 'Сообщения',
}

export default function SearchPage() {
  const router = useRouter()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const searchParams = useSearchParams()
  const initialQuery = searchParams.get('q') ?? ''

  const [query, setQuery] = useState(initialQuery)
  const debouncedQuery = useDebounce(query, 250)

  // Синхронизация URL при изменении запроса (без перезагрузки страницы)
  useEffect(() => {
    if (!workspaceId) return
    const url = new URL(window.location.href)
    if (debouncedQuery) url.searchParams.set('q', debouncedQuery)
    else url.searchParams.delete('q')
    window.history.replaceState(null, '', url.toString())
  }, [debouncedQuery, workspaceId])

  const { data: results, isFetching } = useGlobalSearch(workspaceId, debouncedQuery, 40)
  const resolveProjectIcon = useProjectIconResolver(workspaceId)

  const isSearchMode = debouncedQuery.trim().length >= 2

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

  const openThread = useCallback(async (threadId: string) => {
    await openThreadById(threadId)
  }, [])

  const handlePick = useCallback(
    async (it: GlobalSearchRow) => {
      if (!workspaceId) return
      const wsPrefix = `/workspaces/${workspaceId}`
      switch (it.entity_type) {
        case 'thread':
          await openThread(it.entity_id)
          break
        case 'message':
          if (it.thread_id) await openThread(it.thread_id)
          break
        case 'project':
          router.push(`${wsPrefix}/projects/${it.entity_id}`)
          break
        case 'knowledge_article':
          router.push(`${wsPrefix}/settings/knowledge-base/${it.entity_id}`)
          break
        case 'participant':
          router.push(`${wsPrefix}/settings/participants`)
          break
      }
    },
    [workspaceId, router, openThread],
  )

  return (
    <WorkspaceLayout>
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="max-w-4xl mx-auto w-full">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по тредам, проектам, базе знаний и контактам…"
                autoFocus
                className="w-full h-11 pl-10 pr-10 text-base bg-white border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  aria-label="Очистить"
                  onClick={() => setQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700 rounded"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto w-full px-6 py-6">
            {!isSearchMode ? (
              <div className="text-center text-sm text-gray-500 py-16">
                Введите минимум 2 символа
              </div>
            ) : isFetching && (!results || results.length === 0) ? (
              <PageLoader label="Ищу…" />
            ) : !results || results.length === 0 ? (
              <div className="text-center text-sm text-gray-500 py-16">
                Ничего не найдено
              </div>
            ) : (
              <div className="space-y-6">
                {grouped.map((group) => (
                  <div key={group.type}>
                    <h2 className="text-xs uppercase tracking-wide text-gray-500 mb-2 px-1">
                      {ENTITY_GROUP_LABEL[group.type]}{' '}
                      <span className="text-gray-400 normal-case tracking-normal">
                        · {group.items.length}
                      </span>
                    </h2>
                    <ul className="bg-white border border-gray-200 rounded-md divide-y divide-gray-100">
                      {group.items.map((it) => (
                        <li key={`${it.entity_type}:${it.entity_id}`}>
                          <button
                            type="button"
                            onClick={() => handlePick(it)}
                            className="w-full text-left px-4 py-2.5 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className="pt-1">
                              <EntityIcon
                                type={it.entity_type}
                                threadType={it.thread_type}
                                accentColor={it.accent_color}
                                projectTemplateId={it.project_template_id}
                                projectStatusId={it.project_status_id}
                                resolveProjectIcon={resolveProjectIcon}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-gray-800">
                                <span className="font-medium">{it.title || '—'}</span>
                                {it.subtitle && (
                                  <span className="text-gray-400 ml-2 font-normal">
                                    {it.subtitle}
                                  </span>
                                )}
                              </div>
                              {it.snippet && (
                                <div
                                  className="text-xs text-gray-500 mt-1 [&_mark]:bg-yellow-200 [&_mark]:text-gray-900 [&_mark]:rounded-sm [&_mark]:px-0.5"
                                  dangerouslySetInnerHTML={{ __html: it.snippet }}
                                />
                              )}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </WorkspaceLayout>
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
}: {
  type: GlobalSearchEntityType
  threadType: string | null
  accentColor: string | null
  projectTemplateId: string | null
  projectStatusId: string | null
  resolveProjectIcon: ProjectIconResolver
}) {
  const size = 16
  if (type === 'project') {
    const { iconId, iconColor } = resolveProjectIcon(projectTemplateId, projectStatusId)
    return createElement(getProjectIcon(iconId), {
      size,
      className: 'shrink-0',
      style: { color: safeCssColor(iconColor || '#6B7280') },
    })
  }
  const useAccent = accentColor && (type === 'thread' || type === 'message')
  const accentClass = useAccent ? COLOR_TEXT[accentColor! as ThreadAccentColor] ?? 'text-gray-500' : 'text-gray-500'
  const cls = cn('shrink-0', accentClass)
  if (type === 'thread' || type === 'message') {
    if (threadType === 'task') return <ListChecks size={size} className={cls} />
    if (threadType === 'email') return <Mail size={size} className={cls} />
    return <MessageSquare size={size} className={cls} />
  }
  if (type === 'knowledge_article') return <BookOpen size={size} className={cls} />
  if (type === 'participant') return <User size={size} className={cls} />
  return <Quote size={size} className={cls} />
}
