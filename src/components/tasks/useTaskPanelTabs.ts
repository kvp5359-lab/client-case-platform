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
import { taskPanelTabsKeys, messengerKeys, STALE_TIME } from '@/hooks/queryKeys'
import { useAuth } from '@/contexts/AuthContext'
import {
  fetchTaskPanelTabs,
  upsertTaskPanelTabs,
  type TaskPanelScopeKind,
  type TaskPanelPersistedRow,
} from '@/services/taskPanelTabsService'
import type { TaskPanelTab, TaskPanelTabType } from '@/types/taskPanelTabs'
import { makeTabId } from '@/types/taskPanelTabs'

/** Минимальная информация о треде для конверсии short_id ↔ uuid в URL. */
type ThreadShortIdInfo = { id: string; short_id: number | null }

/**
 * Канонизирует tabId, преобразуя URL-формат `thread:<short_id>` (числовой) в
 * `thread:<uuid>` для матчинга с tab.id. Если tabId уже UUID или не "thread:" — возвращает как есть.
 */
function canonicalizeTabId(rawId: string | null, threads: ThreadShortIdInfo[]): string | null {
  if (!rawId || !rawId.startsWith('thread:')) return rawId
  const ref = rawId.slice('thread:'.length)
  if (/^\d+$/.test(ref)) {
    const shortId = parseInt(ref, 10)
    const t = threads.find((x) => x.short_id === shortId)
    if (t) return `thread:${t.id}`
  }
  return rawId
}

type PersistedRow = TaskPanelPersistedRow

/**
 * Внутренний payload для debounced persist. Содержит snapshot scope
 * на момент вызова persist, чтобы между debounce-таймером (250 мс) и
 * реальной записью scope не сменился. Без snapshot'а ловили race:
 * юзер на проекте A добавлял `tasks:A`, переключался на B до срабатывания
 * таймера → mutation писала `tasks:A` в запись scope=B (refId одной вкладки
 * указывал на чужой проект). 4 битые записи у одного пользователя за неделю.
 */
type PersistPayload = PersistedRow & {
  _scopeKind: TaskPanelScopeKind
  _scopeKey: string
  _userId: string
}

type UseTaskPanelTabsParams = {
  projectId: string | null | undefined
  /** Если задан, scope вкладок — этот контакт (для тредов без проекта). */
  contactId?: string | null
  /** Если задан И НЕТ projectId/contactId — scope «knowledge»: глобальный
   *  per-user-per-workspace пул для статей KB, открываемых вне проекта. */
  knowledgeWorkspaceId?: string | null
}

type ScopeKind = TaskPanelScopeKind

type UseTaskPanelTabsResult = {
  tabs: TaskPanelTab[]
  activeTabId: string | null
  activeTab: TaskPanelTab | null
  isReady: boolean
  /** true если для проекта/пользователя ещё нет записи в БД — можно засеять дефолтные вкладки. */
  isNewProject: boolean
  /** Открыть/активировать вкладку. Если такой уже есть — просто активирует, без дубля.
   *  urlMode: 'push' (по умолчанию) — запись в историю браузера; 'replace' — без записи;
   *  'none' — URL вообще не трогаем (открытие по кнопке «Назад», URL уже верный). */
  openTab: (tab: TaskPanelTab, urlMode?: 'push' | 'replace' | 'none') => void
  /** Закрыть вкладку. Если активную — активирует соседнюю (правую, иначе левую). */
  closeTab: (id: string) => void
  /** Активировать существующую вкладку. urlMode: 'push' (по умолчанию) — переключение
   *  попадает в историю браузера; 'replace' — без записи; 'none' — URL не трогаем. */
  activateTab: (id: string | null, urlMode?: 'push' | 'replace' | 'none') => void
  /** Закрыть все вкладки (полный сброс). */
  closeAll: () => void
  /** Переключить закрепление вкладки. Закреплённые рендерятся слева. */
  togglePin: (id: string) => void
  /** Переупорядочить вкладки: переместить вкладку с id `activeId` на место перед `overId`
   *  (если overId === null — в конец своей группы). pin/unpin обрабатывается отдельно. */
  reorderTab: (activeId: string, overId: string | null, pinned: boolean) => void
  /** Засеять набор вкладок (используется один раз для новых проектов). */
  seedTabs: (seed: TaskPanelTab[], activeId?: string | null) => void
  /** Очистить ?panelTab= из URL без изменения активной вкладки. */
  clearUrlActive: () => void
  /** Записать любой tabId в URL `?panelTab=...` без изменения активной вкладки
   *  в текущем scope. Используется standalone-режимом (свой in-memory state),
   *  чтобы shareable-ссылка обновлялась так же, как для project/contact tabs.
   *  `history='push'` добавляет запись в историю браузера (кнопка «Назад»
   *  вернёт предыдущий тред); по умолчанию `'replace'` — без новой записи. */
  setUrlActive: (tabId: string | null, history?: 'push' | 'replace') => void
}

const EMPTY_STATE: PersistedRow = { tabs: [], active_tab_id: null }

/**
 * Дедупликация вкладок по id. Оставляет первое вхождение, но если среди
 * дублей был pinned — переносит флаг на сохранённую вкладку (чтобы не
 * «открепить» её случайно). Лечит legacy-мусор в task_panel_tabs, где
 * scope-race + sanitizeTabsForScope создавали два экземпляра `tasks:<projectId>`
 * (один pinned из сидера, второй — перепривязанный из чужого scope), что
 * давало дублирующиеся иконки и React key-collision (вкладки «не кликались»).
 */
function dedupeTabsById(tabs: TaskPanelTab[]): TaskPanelTab[] {
  const indexById = new Map<string, number>()
  const result: TaskPanelTab[] = []
  for (const t of tabs) {
    const existing = indexById.get(t.id)
    if (existing === undefined) {
      indexById.set(t.id, result.length)
      result.push(t)
    } else if (t.pinned && !result[existing].pinned) {
      result[existing] = { ...result[existing], pinned: true }
    }
  }
  return result
}

export function useTaskPanelTabs({
  projectId,
  contactId,
  knowledgeWorkspaceId,
}: UseTaskPanelTabsParams): UseTaskPanelTabsResult {
  const { user } = useAuth()
  const userId = user?.id
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Один из трёх — scope вкладок. Project > contact > knowledge по приоритету.
  const scopeKind: ScopeKind | null = projectId
    ? 'project'
    : contactId
      ? 'contact'
      : knowledgeWorkspaceId
        ? 'knowledge'
        : null
  const scopeKey = projectId ?? contactId ?? knowledgeWorkspaceId ?? null

  const enabled = !!scopeKey && !!userId
  const queryKey = useMemo(
    () => taskPanelTabsKeys.byProjectUser(scopeKey ?? '', userId ?? ''),
    [scopeKey, userId],
  )

  // Загрузка из БД — data layer в services/taskPanelTabsService.ts
  const { data: persisted, isSuccess } = useQuery<PersistedRow>({
    queryKey,
    enabled,
    staleTime: STALE_TIME.LONG,
    queryFn: async () => {
      if (!scopeKey || !userId || !scopeKind) return EMPTY_STATE
      return fetchTaskPanelTabs({ scopeKind, scopeId: scopeKey, userId })
    },
  })

  // Локальное состояние — оптимистичная копия. Синхронизируется при загрузке.
  const [localTabs, setLocalTabs] = useState<TaskPanelTab[]>([])
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (isSuccess && persisted && !hydrated) {
      setLocalTabs(dedupeTabsById(persisted.tabs))
      setHydrated(true)
    }
  }, [isSuccess, persisted, hydrated])

  // Refs для debounced persist — объявляем до сброса при смене проекта,
  // чтобы можно было отменить in-flight upsert.
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistPayloadRef = useRef<PersistPayload | null>(null)

  // Сброс при смене проекта — render-time pattern из React docs
  // (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // ВАЖНО: при смене projectId также отменяем in-flight debounced persist,
  // иначе stale-вкладки от старого проекта запишутся в строку нового
  // (race condition наблюдалась ранее: вкладки протекали между проектами).
  const [lastScopeKey, setLastScopeKey] = useState(scopeKey)
  if (scopeKey !== lastScopeKey) {
    setLastScopeKey(scopeKey)
    setLocalTabs([])
    setHydrated(false)
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current)
      persistTimerRef.current = null
    }
    persistPayloadRef.current = null
  }

  // Список тредов проекта из React Query кеша — для конверсии short_id ↔ uuid в URL.
  const projectThreadsCache = queryClient.getQueryData<ThreadShortIdInfo[]>(
    messengerKeys.projectThreads(projectId ?? ''),
  )
  const threadShortMap: ThreadShortIdInfo[] = useMemo(
    () =>
      (projectThreadsCache ?? []).map((t) => ({
        id: t.id,
        short_id: t.short_id ?? null,
      })),
    [projectThreadsCache],
  )

  // Активная вкладка — из URL. URL может содержать `thread:<short_id>` (числовой) —
  // канонизируем в `thread:<uuid>` для матчинга с tab.id. Если URL не указывает или
  // указывает несуществующую вкладку — fallback на persisted.active_tab_id или последнюю.
  const rawUrlActiveId = searchParams?.get('panelTab') ?? null
  const urlActiveId = useMemo(
    () => canonicalizeTabId(rawUrlActiveId, threadShortMap),
    [rawUrlActiveId, threadShortMap],
  )
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

  // Сохранение в БД — data layer в services/taskPanelTabsService.ts.
  // Костыль вокруг partial unique инкапсулирован там.
  // Scope берём из payload (snapshot на момент persist), НЕ из closure хука —
  // иначе при смене проекта между постановкой debounce и его срабатыванием
  // mutation писала бы tabs старого scope в строку нового (см. PersistPayload).
  const upsertMutation = useMutation({
    mutationFn: async (next: PersistPayload) => {
      await upsertTaskPanelTabs({
        scopeKind: next._scopeKind,
        scopeId: next._scopeKey,
        userId: next._userId,
        tabs: next.tabs,
        activeTabId: next.active_tab_id,
      })
    },
    onSuccess: (_data, vars) => {
      queryClient.setQueryData<PersistedRow>(
        taskPanelTabsKeys.byProjectUser(vars._scopeKey, vars._userId),
        { tabs: vars.tabs, active_tab_id: vars.active_tab_id },
      )
    },
  })

  // Обновление URL: ставим/убираем ?panelTab=
  // Пишем tabId как есть (`thread:<uuid>`) — стабильный формат, не завязанный на
  // кэш short_id. На чтении canonicalizeTabId по-прежнему принимает и старые
  // короткие ссылки `thread:<short>`. Стабильный uuid критичен для навигации
  // «Назад»: обработчик popstate матчит URL по uuid, без гонок резолва.
  const setUrlActive = useCallback(
    (tabId: string | null, history: 'push' | 'replace' = 'replace') => {
      if (typeof window === 'undefined') return
      const params = new URLSearchParams(searchParams?.toString() ?? '')
      const writeId = tabId
      if (writeId) {
        if (params.get('panelTab') === writeId) return
        params.set('panelTab', writeId)
      } else {
        if (!params.has('panelTab')) return
        params.delete('panelTab')
      }
      const qs = params.toString()
      const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`
      // push — только при открытии треда (openTab): каждая новая вкладка = запись
      // в истории браузера, «Назад» возвращает предыдущий тред. Остальные операции
      // (закрытие/реордер/seed/очистка) — replace, чтобы не засорять историю.
      if (history === 'push') router.push(url, { scroll: false })
      else router.replace(url, { scroll: false })
    },
    [router, searchParams],
  )

  // Debounce сохранения в БД: при быстрых переключениях вкладок (open/close/activate)
  // не отправляем по upsert на каждый клик. Только последнее состояние через 250ms.
  // persistTimerRef и persistPayloadRef объявлены выше — для отмены при смене проекта.
  const upsertMutationRef = useRef(upsertMutation)
  useEffect(() => {
    upsertMutationRef.current = upsertMutation
  }, [upsertMutation])

  // Ref'ы текущего scope — для race-guard'а внутри setTimeout.
  // Захватываем scope в момент вызова persist в payload; при срабатывании
  // таймера сравниваем с current scope. Если разошлось — отбрасываем payload
  // (юзер успел перейти на другой проект, эти tabs относятся к старому scope).
  const scopeKeyRef = useRef(scopeKey)
  const scopeKindRef = useRef(scopeKind)
  useEffect(() => {
    scopeKeyRef.current = scopeKey
    scopeKindRef.current = scopeKind
  }, [scopeKey, scopeKind])

  /**
   * Sanity-нормализация: если в tabs есть `tasks`-вкладка с refId, указывающим
   * на чужой проект — переписываем refId/id на текущий scope. Защита от
   * остатков битого state в localTabs (на случай, если БД-фикс пропустил
   * какой-то edge case или новый race пройдёт через ref-guard).
   * Логируем как BUG.tasks_ref_mismatch для будущего отлова.
   */
  const sanitizeTabsForScope = useCallback(
    (tabs: TaskPanelTab[], scopeId: string, kind: TaskPanelScopeKind): TaskPanelTab[] => {
      if (kind !== 'project') return tabs
      let changed = false
      const result = tabs.map((t) => {
        if (t.type !== 'tasks') return t
        if (t.refId === scopeId) return t
        changed = true
        return { ...t, id: `tasks:${scopeId}`, refId: scopeId }
      })
      if (changed) {
        console.warn(
          '[BUG.tasks_ref_mismatch] tasks-вкладка с чужим refId перехвачена перед записью',
          { scopeId, tabs: tabs.map((t) => ({ id: t.id, type: t.type, refId: t.refId })) },
        )
      }
      return result
    },
    [],
  )

  const persist = useCallback(
    (nextTabs: TaskPanelTab[], nextActiveId: string | null) => {
      // Snapshot scope в момент вызова — закрывает race condition
      // между debounce-таймером и сменой проекта.
      const targetScopeKey = scopeKey
      const targetScopeKind = scopeKind
      const targetUserId = userId
      if (!targetScopeKey || !targetScopeKind || !targetUserId) return

      // sanitizeTabsForScope может перепривязать чужую tasks-вкладку на текущий
      // scope и создать второй экземпляр с тем же id — поэтому дедупим ПОСЛЕ него.
      const safeTabs = dedupeTabsById(
        sanitizeTabsForScope(nextTabs, targetScopeKey, targetScopeKind),
      )

      persistPayloadRef.current = {
        tabs: safeTabs,
        active_tab_id: nextActiveId,
        _scopeKey: targetScopeKey,
        _scopeKind: targetScopeKind,
        _userId: targetUserId,
      }
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      persistTimerRef.current = setTimeout(() => {
        const payload = persistPayloadRef.current
        if (payload) {
          // Race-guard: если scope успел смениться, отбрасываем payload
          // (его tabs относятся к прежнему scope, не пишем в новый).
          if (payload._scopeKey === scopeKeyRef.current) {
            upsertMutationRef.current.mutate(payload)
          }
          persistPayloadRef.current = null
        }
        persistTimerRef.current = null
      }, 250)
    },
    [scopeKey, scopeKind, userId, sanitizeTabsForScope],
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
    (tab: TaskPanelTab, urlMode: 'push' | 'replace' | 'none' = 'push') => {
      const exists = localTabs.some((t) => t.id === tab.id)
      const next = exists ? localTabs : [...localTabs, tab]
      if (!exists) setLocalTabs(next)
      persist(next, tab.id)
      // push → открытие треда попадает в историю браузера (см. setUrlActive).
      // 'none' — URL уже верный (открытие по кнопке «Назад»), историю не трогаем.
      if (urlMode !== 'none') setUrlActive(tab.id, urlMode)
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
    (id: string | null, urlMode: 'push' | 'replace' | 'none' = 'push') => {
      // push → переключение вкладки попадает в историю браузера (кнопка «Назад»
      // вернёт предыдущую активную вкладку). 'none' — URL уже верный (открытие по
      // «Назад»), историю не трогаем.
      if (urlMode !== 'none') setUrlActive(id, urlMode)
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
    (activeId: string, overId: string | null, pinned: boolean) => {
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
      const movedTab = { ...tab, pinned }
      const inserted = [...without.slice(0, insertIdx), movedTab, ...without.slice(insertIdx)]
      // Нормализуем: pinned сначала, unpinned потом, сохраняя относительный порядок
      // в каждой зоне. Иначе drop активной перед unpinned, который случайно
      // оказался в середине localTabs, не даёт «положить в конец pinned» —
      // активная встаёт прямо перед этим unpinned, а оставшиеся pinned остаются
      // правее. Источник смешанного порядка — старые/мерж-записи в БД.
      const next = [
        ...inserted.filter((t) => t.pinned),
        ...inserted.filter((t) => !t.pinned),
      ]
      setLocalTabs(next)
      persist(next, activeTabId)
    },
    [localTabs, activeTabId, persist],
  )

  /** Очистить query-параметр ?panelTab=, не трогая активную вкладку.
   *  Нужно для «закрыть панель» (hidePanel): юзер не хочет видеть тред
   *  в URL, но при следующем открытии панели вкладка должна остаться. */
  const clearUrlActive = useCallback(() => setUrlActive(null), [setUrlActive])

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
    clearUrlActive,
    setUrlActive,
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
export function buildSystemTab(
  type: Exclude<TaskPanelTabType, 'thread' | 'knowledge_article'>,
  title: string,
): TaskPanelTab {
  return { id: makeTabId(type), type, title }
}

/** Хелпер для вкладки статьи базы знаний. refId = articleId. */
export function buildKnowledgeArticleTab(articleId: string, title: string): TaskPanelTab {
  return {
    id: makeTabId('knowledge_article', articleId),
    type: 'knowledge_article',
    refId: articleId,
    title,
  }
}
