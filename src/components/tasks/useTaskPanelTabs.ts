"use client"

/**
 * useTaskPanelTabs — состояние вкладок боковой панели треда per-user-per-project.
 *
 * Источники правды:
 *  - Набор вкладок и порядок: таблица `task_panel_tabs` (loaded via React Query).
 *  - Активная вкладка: query-параметр `?panelTab=<tabId>` (для shareable links).
 *
 * Стратегия: оптимистичное локальное состояние + upsert в БД на каждое изменение.
 * URL обновляется через `router.replace` (без нового entry в history).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { taskPanelTabsKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import type { TaskPanelTab, TaskPanelTabType } from './taskPanelTabs.types'
import { makeTabId } from './taskPanelTabs.types'

interface PersistedRow {
  tabs: TaskPanelTab[]
  active_tab_id: string | null
}

interface UseTaskPanelTabsParams {
  projectId: string | null | undefined
}

interface UseTaskPanelTabsResult {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  activeTab: TaskPanelTab | null
  isReady: boolean
  /** Открыть/активировать вкладку. Если такой уже есть — просто активирует, без дубля. */
  openTab: (tab: TaskPanelTab) => void
  /** Закрыть вкладку. Если активную — активирует соседнюю (правую, иначе левую). */
  closeTab: (id: string) => void
  /** Активировать существующую вкладку. */
  activateTab: (id: string | null) => void
  /** Закрыть все вкладки (полный сброс). */
  closeAll: () => void
}

const EMPTY_STATE: PersistedRow = { tabs: [], active_tab_id: null }

export function useTaskPanelTabs({ projectId }: UseTaskPanelTabsParams): UseTaskPanelTabsResult {
  const { user } = useAuth()
  const userId = user?.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  const enabled = !!projectId && !!userId
  const queryKey = useMemo(
    () => taskPanelTabsKeys.byProjectUser(projectId ?? '', userId ?? ''),
    [projectId, userId],
  )

  // Загрузка из БД
  const { data: persisted, isSuccess } = useQuery<PersistedRow>({
    queryKey,
    enabled,
    staleTime: STALE_TIME.LONG,
    queryFn: async () => {
      if (!projectId || !userId) return EMPTY_STATE
      // Таблица task_panel_tabs ещё не в сгенерированных Supabase-типах —
      // используем нестрогий клиент для этого вызова.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            eq: (
              c: string,
              v: string,
            ) => {
              eq: (
                c: string,
                v: string,
              ) => {
                maybeSingle: () => Promise<{
                  data: { tabs: unknown; active_tab_id: string | null } | null
                  error: { message: string } | null
                }>
              }
            }
          }
        }
      })
        .from('task_panel_tabs')
        .select('tabs, active_tab_id')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle()
      if (error) throw error
      if (!data) return EMPTY_STATE
      return {
        tabs: Array.isArray(data.tabs) ? (data.tabs as TaskPanelTab[]) : [],
        active_tab_id: data.active_tab_id ?? null,
      }
    },
  })

  // Локальное состояние — оптимистичная копия. Синхронизируется при загрузке.
  const [localTabs, setLocalTabs] = useState<TaskPanelTab[]>([])
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (isSuccess && persisted && !hydrated) {
      setLocalTabs(persisted.tabs)
      setHydrated(true)
    }
  }, [isSuccess, persisted, hydrated])

  // Сброс при смене проекта
  const prevProjectRef = useRef(projectId)
  useEffect(() => {
    if (prevProjectRef.current !== projectId) {
      prevProjectRef.current = projectId
      setLocalTabs([])
      setHydrated(false)
    }
  }, [projectId])

  // Активная вкладка — из URL. Если URL не указывает или указывает несуществующую,
  // и в локальных есть вкладки, fallback на persisted.active_tab_id или последнюю.
  const urlActiveId = searchParams?.get('panelTab') ?? null
  const activeTabId = useMemo(() => {
    if (!hydrated) return null
    if (urlActiveId && localTabs.some((t) => t.id === urlActiveId)) return urlActiveId
    const pid = persisted?.active_tab_id ?? null
    if (pid && localTabs.some((t) => t.id === pid)) return pid
    return localTabs.length > 0 ? localTabs[localTabs.length - 1].id : null
  }, [hydrated, urlActiveId, localTabs, persisted?.active_tab_id])

  const activeTab = useMemo(
    () => localTabs.find((t) => t.id === activeTabId) ?? null,
    [localTabs, activeTabId],
  )

  // Сохранение в БД (upsert)
  const upsertMutation = useMutation({
    mutationFn: async (next: PersistedRow) => {
      if (!projectId || !userId) return
      const { error } = await (supabase as unknown as {
        from: (t: string) => {
          upsert: (
            row: Record<string, unknown>,
            opts: { onConflict: string },
          ) => Promise<{ error: { message: string } | null }>
        }
      })
        .from('task_panel_tabs')
        .upsert(
          {
            user_id: userId,
            project_id: projectId,
            tabs: next.tabs as unknown,
            active_tab_id: next.active_tab_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,project_id' },
        )
      if (error) throw error
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<PersistedRow>(queryKey, vars)
    },
  })

  // Обновление URL: ставим/убираем ?panelTab=
  const setUrlActive = useCallback(
    (tabId: string | null) => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      if (tabId) {
        if (params.get('panelTab') === tabId) return
        params.set('panelTab', tabId)
      } else {
        if (!params.has('panelTab')) return
        params.delete('panelTab')
      }
      const qs = params.toString()
      router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
    },
    [router, searchParams],
  )

  // Debounce сохранения в БД: при быстрых переключениях вкладок (open/close/activate)
  // не отправляем по upsert на каждый клик. Только последнее состояние через 250ms.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistPayloadRef = useRef<PersistedRow | null>(null)
  const upsertMutationRef = useRef(upsertMutation)
  upsertMutationRef.current = upsertMutation

  const persist = useCallback(
    (nextTabs: TaskPanelTab[], nextActiveId: string | null) => {
      persistPayloadRef.current = { tabs: nextTabs, active_tab_id: nextActiveId }
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = setTimeout(() => {
        if (persistPayloadRef.current) {
          upsertMutationRef.current.mutate(persistPayloadRef.current)
          persistPayloadRef.current = null
        }
        persistTimerRef.current = null
      }, 250)
    },
    [],
  )

  // На размонтировании — flush pending upsert, чтобы не потерять последнее состояние.
  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current)
        if (persistPayloadRef.current) {
          upsertMutationRef.current.mutate(persistPayloadRef.current)
        }
      }
    }
  }, [])

  const openTab = useCallback(
    (tab: TaskPanelTab) => {
      setLocalTabs((prev) => {
        const exists = prev.some((t) => t.id === tab.id)
        const next = exists ? prev : [...prev, tab]
        persist(next, tab.id)
        return next
      })
      setUrlActive(tab.id)
    },
    [persist, setUrlActive],
  )

  const closeTab = useCallback(
    (id: string) => {
      setLocalTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === id)
        if (idx === -1) return prev
        const next = prev.filter((t) => t.id !== id)
        let nextActive: string | null = activeTabId
        if (activeTabId === id) {
          // активируем правого соседа, иначе левого, иначе null
          nextActive = next[idx]?.id ?? next[idx - 1]?.id ?? null
        }
        persist(next, nextActive)
        if (activeTabId === id) setUrlActive(nextActive)
        return next
      })
    },
    [activeTabId, persist, setUrlActive],
  )

  const activateTab = useCallback(
    (id: string | null) => {
      setUrlActive(id)
      const cur = localTabs
      persist(cur, id)
    },
    [localTabs, persist, setUrlActive],
  )

  const closeAll = useCallback(() => {
    setLocalTabs([])
    persist([], null)
    setUrlActive(null)
  }, [persist, setUrlActive])

  return {
    tabs: localTabs,
    activeTabId,
    activeTab,
    isReady: hydrated || !enabled,
    openTab,
    closeTab,
    activateTab,
    closeAll,
  }
}

/** Хелпер для построения объекта вкладки треда. */
export function buildThreadTab(
  threadId: string,
  title: string,
  meta?: TaskPanelTab['meta'],
): TaskPanelTab {
  return { id: makeTabId('thread', threadId), type: 'thread', refId: threadId, title, meta }
}

/** Хелпер для системных вкладок (tasks/history/documents/forms/materials/assistant/extra). */
export function buildSystemTab(type: Exclude<TaskPanelTabType, 'thread'>, title: string): TaskPanelTab {
  return { id: makeTabId(type), type, title }
}
