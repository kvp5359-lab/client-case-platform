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
  /** true если строки для пары user/project в БД ещё нет. */
  isNew?: boolean
}

interface UseTaskPanelTabsParams {
  projectId: string | null | undefined
}

interface UseTaskPanelTabsResult {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  activeTab: TaskPanelTab | null
  isReady: boolean
  /** true если для проекта/пользователя ещё нет записи в БД — можно засеять дефолтные вкладки. */
  isNewProject: boolean
  /** Открыть/активировать вкладку. Если такой уже есть — просто активирует, без дубля. */
  openTab: (tab: TaskPanelTab) => void
  /** Закрыть вкладку. Если активную — активирует соседнюю (правую, иначе левую). */
  closeTab: (id: string) => void
  /** Активировать существующую вкладку. */
  activateTab: (id: string | null) => void
  /** Закрыть все вкладки (полный сброс). */
  closeAll: () => void
  /** Переключить закрепление вкладки. Закреплённые рендерятся слева. */
  togglePin: (id: string) => void
  /** Переупорядочить вкладки: переместить вкладку с id `activeId` на место перед `overId`
   *  (если overId === null — в конец своей группы). pin/unpin обрабатывается отдельно. */
  reorderTab: (activeId: string, overId: string | null) => void
  /** Засеять набор вкладок (используется один раз для новых проектов). */
  seedTabs: (seed: TaskPanelTab[], activeId?: string | null) => void
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
      if (!data) return { ...EMPTY_STATE, isNew: true }
      return {
        tabs: Array.isArray(data.tabs) ? (data.tabs as TaskPanelTab[]) : [],
        active_tab_id: data.active_tab_id ?? null,
        isNew: false,
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

  // Сброс при смене проекта — render-time pattern из React docs
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [lastProjectId, setLastProjectId] = useState(projectId)
  if (projectId !== lastProjectId) {
    setLastProjectId(projectId)
    setLocalTabs([])
    setHydrated(false)
  }

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
  useEffect(() => {
    upsertMutationRef.current = upsertMutation
  }, [upsertMutation])

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
      const exists = localTabs.some((t) => t.id === tab.id)
      const next = exists ? localTabs : [...localTabs, tab]
      if (!exists) setLocalTabs(next)
      persist(next, tab.id)
      setUrlActive(tab.id)
    },
    [localTabs, persist, setUrlActive],
  )

  const closeTab = useCallback(
    (id: string) => {
      // Вычисляем next/nextActive снаружи updater'а, чтобы не дёргать
      // router.replace и другие setState внутри reducer-фазы React 19
      // (иначе ловим «Cannot update Router while rendering …»).
      const idx = localTabs.findIndex((t) => t.id === id)
      if (idx === -1) return
      const next = localTabs.filter((t) => t.id !== id)
      const nextActive =
        activeTabId === id
          ? next[idx]?.id ?? next[idx - 1]?.id ?? null
          : activeTabId
      setLocalTabs(next)
      persist(next, nextActive)
      if (activeTabId === id) setUrlActive(nextActive)
    },
    [localTabs, activeTabId, persist, setUrlActive],
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

  const togglePin = useCallback(
    (id: string) => {
      const target = localTabs.find((t) => t.id === id)
      if (!target) return
      const wasPinned = !!target.pinned
      // Закрепляем → перемещаем в конец pinned-блока. Откреплённое идёт в начало unpinned.
      const updated = localTabs.map((t) => (t.id === id ? { ...t, pinned: !wasPinned } : t))
      const pinned = updated.filter((t) => t.pinned)
      const unpinned = updated.filter((t) => !t.pinned)
      const next = wasPinned
        ? [...pinned, { ...target, pinned: false }, ...unpinned.filter((t) => t.id !== id)]
        : [...pinned.filter((t) => t.id !== id), { ...target, pinned: true }, ...unpinned]
      setLocalTabs(next)
      persist(next, activeTabId)
    },
    [localTabs, activeTabId, persist],
  )

  const seedTabs = useCallback(
    (seed: TaskPanelTab[], activeId: string | null = seed[seed.length - 1]?.id ?? null) => {
      setLocalTabs(seed)
      persist(seed, activeId)
      setUrlActive(activeId)
    },
    [persist, setUrlActive],
  )

  const reorderTab = useCallback(
    (activeId: string, overId: string | null) => {
      const fromIdx = localTabs.findIndex((t) => t.id === activeId)
      if (fromIdx === -1) return
      const tab = localTabs[fromIdx]
      const without = localTabs.filter((t) => t.id !== activeId)
      let insertIdx: number
      if (overId === null) {
        insertIdx = without.length
      } else {
        insertIdx = without.findIndex((t) => t.id === overId)
        if (insertIdx === -1) insertIdx = without.length
      }
      // Корректировка: закреплённые должны оставаться слева, откреплённые — справа.
      // Если переносим закреплённую за пределы pinned-блока, обрезаем по последнему pinned + 1.
      const pinnedCount = without.filter((t) => t.pinned).length
      if (tab.pinned && insertIdx > pinnedCount) insertIdx = pinnedCount
      if (!tab.pinned && insertIdx < pinnedCount) insertIdx = pinnedCount
      const next = [...without.slice(0, insertIdx), tab, ...without.slice(insertIdx)]
      setLocalTabs(next)
      persist(next, activeTabId)
    },
    [localTabs, activeTabId, persist],
  )

  return {
    tabs: localTabs,
    activeTabId,
    activeTab,
    isReady: hydrated || !enabled,
    isNewProject: persisted?.isNew ?? false,
    openTab,
    closeTab,
    activateTab,
    closeAll,
    togglePin,
    reorderTab,
    seedTabs,
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
