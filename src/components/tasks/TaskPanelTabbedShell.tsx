"use client"

/**
 * TaskPanelTabbedShell — обёртка над TaskPanel с системой вкладок.
 *
 * Заменяет в WorkspaceLayout прямое использование <TaskPanel> + useTaskPanelSetup.
 * Управляет набором открытых вкладок (per-user-per-project, DB-backed) и сверху
 * каждой панели рендерит TaskPanelTabBar.
 *
 * Маршрутизация контента вкладки:
 *  - thread → существующий TaskPanel в режиме треда (с TabBar в topSlot)
 *  - tasks  → существующий TaskPanel в режиме проекта (Mode 2) с TabBar в topSlot
 *  - history/documents/assistant/extra/forms/materials → собственный shell + контент
 *
 * Контент вкладок (ThreadTabContent/TasksTabContent/SystemTabBody) — в TaskPanelTabContents.tsx.
 * Видимость по правам — в usePanelTabsVisibility.ts.
 * Маппинг ProjectThread → TaskItem — в threadToTaskItem.ts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { useTrackRecentView } from '@/hooks/useGlobalSearch'
import { type SystemTabDef } from './TaskPanelTabBar'
import {
  useTaskPanelTabs,
  buildSystemTab,
  buildThreadTab,
  buildKnowledgeArticleTab,
} from './useTaskPanelTabs'
import { useStandaloneTabs } from './useStandaloneTabs'
import { useThreadFromPanelTab } from './useThreadFromPanelTab'
import { TaskPanelTabbedShellRenderer } from './TaskPanelTabbedShellRenderer'
import type { TaskPanelTab, TaskPanelTabType } from './taskPanelTabs.types'
import type { TaskItem, ProjectHeaderInfo } from './types'

type TaskPanelTabbedShellProps = {
  workspaceId: string
  /**
   * projectId текущей страницы — стартовое значение «активного проекта».
   * При открытии треда/проекта другого projectId shell автоматически переключится
   * на его scope (вкладки per-project). На страницах без проекта (/boards, /inbox)
   * передаём null — projectId возьмётся из task.project_id первого открываемого треда.
   */
  pageProjectId: string | null
}

export type TaskPanelTabbedShellApi = {
  /** Открыть тред во вкладке (или активировать существующую). */
  openThreadTab: (task: TaskItem) => void
  /** Открыть «список задач проекта» во вкладке (Mode 2 старого TaskPanel). */
  openProjectTab: (project: ProjectHeaderInfo) => void
  /** Открыть системную вкладку (assistant / documents / forms / materials / history / extra). */
  openSystemTab: (type: Exclude<TaskPanelTabType, 'thread' | 'tasks' | 'knowledge_article'>, title: string) => void
  /** Открыть статью базы знаний во вкладке текущего scope (project/contact). */
  openKnowledgeArticleTab: (articleId: string, title: string) => void
  /** Закрыть конкретную вкладку по id. */
  closeTab: (id: string) => void
  /** Открытые сейчас вкладки (per-project, DB-backed). */
  openTabs: TaskPanelTab[]
  /** Полный сброс: удалить все вкладки из БД. */
  closeAll: () => void
  /** Скрыть панель UI (вкладки в БД сохраняются). */
  hidePanel: () => void
  /** Показать панель (если есть вкладки — появятся; если нет — no-op). */
  showPanel: () => void
  /** Переключить hidden. */
  togglePanel: () => void
  /** Скрыта ли панель прямо сейчас (но вкладки есть). */
  isHidden: boolean
  /** Есть ли хотя бы одна вкладка. */
  hasTabs: boolean
  /** id треда из активной вкладки (для подсветки в BoardView и т.п.). */
  activeThreadId: string | null
  /** id проекта из активной вкладки (для подсветки проектов на досках). */
  activeProjectRefId: string | null
}

/**
 * Хук, возвращающий и API для внешнего открытия вкладок (для TaskPanelContext),
 * и сами рендер-методы для UI.
 *
 * activeProjectId — динамическое состояние scope. Меняется автоматически при
 * открытии треда/проекта другого projectId. При смене страницы проекта — синк
 * с pageProjectId.
 */
export function useTaskPanelTabbedShell({ workspaceId, pageProjectId }: TaskPanelTabbedShellProps) {
  const [activeProjectId, setActiveProjectId] = useState<string | null>(pageProjectId)
  /** Активный contactId scope-а (для тредов без проекта). */
  const [activeContactId, setActiveContactId] = useState<string | null>(null)
  /** Standalone-режим: тред без project_id и без contact_participant_id. Открывается
   *  изолированно, без TabBar и без записи в task_panel_tabs — потому что
   *  глобальный pool (project_id=null, contact_id=null) смешивал бы все такие
   *  «внутренние» треды воркспейса в одной панели с одинаковыми вкладками. */
  const [standaloneThread, setStandaloneThread] = useState<TaskItem | null>(null)
  /** Knowledge-scope: вкладки статей KB, открытых вне project/contact контекста.
   *  Ключ — workspaceId. Активируется при вызове openKnowledgeArticleTab, когда
   *  нет активного project/contact. См. миграцию 20260523_task_panel_tabs_knowledge_scope. */
  const [knowledgeMode, setKnowledgeMode] = useState(false)
  // Hidden — UI-only флаг «панель скрыта». Не трогает вкладки в БД.
  // Сбрасывается на false при любом open*Tab (см. ниже).
  const [hidden, setHidden] = useState(false)
  // Синк с pageProjectId: переключаем scope ТОЛЬКО когда pageProjectId реально
  // изменился (пользователь перешёл на другой проект). Render-time pattern из
  // React docs (https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [lastPageProjectId, setLastPageProjectId] = useState(pageProjectId)
  if (pageProjectId !== lastPageProjectId) {
    setLastPageProjectId(pageProjectId)
    if (pageProjectId) setActiveProjectId(pageProjectId)
  }

  // Если URL содержит panelTab=thread:<short|uuid> и страница не знает projectId
  // (например, /boards/X) — резолвим тред через RPC, выставляем activeProjectId
  // под scope треда. Это позволяет открывать тред в side panel по shareable-ссылке.
  //
  // ВАЖНО: применяем ОДИН РАЗ при загрузке страницы. Как только пользователь
  // открыл любой тред руками (openThreadTab/openProjectTab → userInteractedRef),
  // больше URL-резолвер scope не трогает. Иначе:
  //   - юзер кликает тред без project_id (личный диалог)
  //   - activeProjectId становится null
  //   - useThreadFromPanelTab асинхронно резолвит СТАРЫЙ panelTab из URL и
  //     возвращает projectId старого треда
  //   - эффект возвращает scope обратно, pendingOpen отбрасывается guard'ом —
  //     панель «дёргается», но остаётся на прежнем треде.
  const resolvedFromUrl = useThreadFromPanelTab(workspaceId)
  const userInteractedRef = useRef(false)
  useEffect(() => {
    if (!resolvedFromUrl) return
    if (pageProjectId) return // на странице проекта scope уже задан
    if (userInteractedRef.current) return
    if (activeProjectId !== null) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- scope-resolver: подхватываем projectId из shareable-ссылки на /boards|/inbox
    setActiveProjectId(resolvedFromUrl.projectId)
  }, [resolvedFromUrl, activeProjectId, pageProjectId])

  const tabs = useTaskPanelTabs({
    projectId: activeProjectId,
    contactId: activeProjectId ? null : activeContactId,
    knowledgeWorkspaceId:
      !activeProjectId && !activeContactId && knowledgeMode ? workspaceId : null,
  })

  // In-memory вкладки для standalone-режима (personal dialogs).
  // Активируется только когда standaloneThread != null; не персистится в БД.
  const standaloneTabs = useStandaloneTabs()
  const inStandalone = !!standaloneThread

  // Очередь pending-вкладок: когда нужно сменить projectId перед openTab,
  // ждём готовности хука с новым projectId. ВАЖНО: храним вместе с
  // targetProjectId — если за время ожидания scope перешёл на другой
  // проект (sync с pageProjectId, навигация по сайдбару), отбрасываем
  // pending, иначе вкладка треда чужого проекта окажется в этом scope
  // и зальётся в task_panel_tabs (мусорные вкладки в правой панели).
  const [pendingOpen, setPendingOpen] = useState<{ tab: TaskPanelTab; projectId: string | null } | null>(null)
  useEffect(() => {
    if (!pendingOpen) return
    if (!tabs.isReady) return
    if (pendingOpen.projectId !== activeProjectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- scope-changed: отбрасываем pending для прошлого проекта
      setPendingOpen(null)
      return
    }
    tabs.openTab(pendingOpen.tab)
    setPendingOpen(null)
  }, [pendingOpen, tabs, activeProjectId])

  // Cleanup мусорных thread-вкладок: для всех пользователей (не только клиентов)
  // удаляем из tabs те thread-вкладки, у которых refId нет среди тредов
  // текущего scope-проекта. Покрывает кейсы: перемещение треда между проектами,
  // soft-delete, race-condition pendingOpen-а до фикса выше (вычищает уже
  // накопившийся мусор в task_panel_tabs).
  const { data: scopeThreadsRaw = [] } = useProjectThreads(activeProjectId ?? undefined)
  const scopeThreadIds = useMemo(
    () => new Set(scopeThreadsRaw.map((t) => t.id)),
    [scopeThreadsRaw],
  )
  const tabsCloseTab = tabs.closeTab
  const tabsTabs = tabs.tabs
  const tabsIsReady = tabs.isReady
  useEffect(() => {
    if (!tabsIsReady) return
    if (!activeProjectId) return
    if (scopeThreadsRaw.length === 0) return // ждём загрузки тредов проекта
    for (const tab of tabsTabs) {
      if (tab.type !== 'thread' || !tab.refId) continue
      if (!scopeThreadIds.has(tab.refId)) {
        tabsCloseTab(tab.id)
      }
    }
  }, [tabsIsReady, tabsTabs, scopeThreadIds, scopeThreadsRaw.length, tabsCloseTab, activeProjectId])

  const tabsOpenTab = tabs.openTab
  const openThreadTab = useCallback(
    async (task: TaskItem) => {
      userInteractedRef.current = true
      const targetPid = task.project_id ?? null
      let targetContactId = targetPid ? null : task.contact_participant_id ?? null
      // Если тред без проекта, а контакт не пришёл — резолвим из БД,
      // чтобы scope боковой панели стал «контактным».
      if (!targetPid && !targetContactId) {
        const { data } = await supabase
          .from('project_threads')
          .select('contact_participant_id')
          .eq('id', task.id)
          .maybeSingle()
        targetContactId = (data as { contact_participant_id?: string | null } | null)?.contact_participant_id ?? null
      }
      setHidden(false)
      // Standalone-режим: нет ни проекта, ни контакта → открываем изолированно
      // с in-memory TabBar (без записи в task_panel_tabs). Тред = первая вкладка,
      // можно добавить рядом ассистента / KB / историю.
      if (!targetPid && !targetContactId) {
        const threadTab = buildThreadTab(task.id, task.name, {
          threadType: task.type,
          icon: task.icon,
          accentColor: task.accent_color,
        })
        setStandaloneThread(task)
        setActiveProjectId(null)
        setActiveContactId(null)
        setPendingOpen(null)
        standaloneTabs.seed([threadTab], threadTab.id)
        return
      }
      // Иначе — обычный scope. Сбрасываем standalone и knowledge-mode, если был.
      setStandaloneThread(null)
      standaloneTabs.reset()
      setKnowledgeMode(false)
      const tab = buildThreadTab(task.id, task.name, {
        threadType: task.type,
        icon: task.icon,
        accentColor: task.accent_color,
      })
      const scopeChanged =
        targetPid !== activeProjectId ||
        targetContactId !== activeContactId
      if (scopeChanged) {
        setActiveProjectId(targetPid)
        setActiveContactId(targetContactId)
        setPendingOpen({ tab, projectId: targetPid })
      } else {
        tabsOpenTab(tab)
      }
    },
    [activeProjectId, activeContactId, tabsOpenTab, standaloneTabs],
  )

  const openProjectTab = useCallback(
    (project: ProjectHeaderInfo) => {
      userInteractedRef.current = true
      const targetPid = project.id
      const tab: TaskPanelTab = {
        id: `tasks:${project.id}`,
        type: 'tasks',
        refId: project.id,
        // Заголовок «Задачи» (одинаковый для обоих путей: и из [+] меню, и из
        // клика на проект на доске). Имя проекта видно в шапке самой вкладки.
        title: 'Задачи',
      }
      setHidden(false)
      setStandaloneThread(null)
      standaloneTabs.reset()
      setKnowledgeMode(false)
      if (targetPid !== activeProjectId) {
        setActiveProjectId(targetPid)
        setPendingOpen({ tab, projectId: targetPid })
      } else {
        tabsOpenTab(tab)
      }
    },
    [activeProjectId, tabsOpenTab, standaloneTabs],
  )

  // Активная вкладка: в standalone берём из in-memory state, иначе из DB-backed tabs.
  const effectiveActiveTab = inStandalone ? standaloneTabs.activeTab : tabs.activeTab

  // Активный thread/project из текущей активной вкладки — для подсветки карточек на доске.
  // Когда панель скрыта, подсветку убираем — иначе обводка карточки остаётся после закрытия.
  const activeThreadId = hidden
    ? null
    : effectiveActiveTab?.type === 'thread'
      ? (effectiveActiveTab.refId ?? null)
      : null
  const activeProjectRefId =
    !hidden && effectiveActiveTab?.type === 'tasks' ? (effectiveActiveTab.refId ?? null) : null

  // Фиксируем открытие треда в «Недавнее». Покрывает ВСЕ способы открытия:
  // клик в списке внутри проекта, на доске, из инбокса, из тоста, из глобального
  // поиска, переход по вкладкам панели. Хук сам инвалидирует кэш «Недавнего» —
  // без этого список обновляется только после reload.
  const { mutate: trackRecentView } = useTrackRecentView()
  useEffect(() => {
    if (!activeThreadId || !workspaceId) return
    trackRecentView({
      workspaceId,
      entityType: 'thread',
      entityId: activeThreadId,
    })
  }, [activeThreadId, workspaceId, trackRecentView])

  const hidePanel = useCallback(() => {
    setHidden(true)
    // Чистим ?panelTab=… из URL, чтобы скопированная ссылка не открывала
    // тред у получателя. Сама вкладка в табах остаётся — можно открыть
    // снова кликом, если пользователь захочет.
    tabs.clearUrlActive()
    // Standalone-тред и его in-memory вкладки нигде не персистятся — при
    // закрытии панели их не к чему возвращать. Очищаем.
    setStandaloneThread(null)
    standaloneTabs.reset()
  }, [tabs, standaloneTabs])
  const showPanel = useCallback(() => {
    setHidden(false)
    // Восстанавливаем ?panelTab=… при показе панели обратно (после hidePanel
    // мы его чистили) — иначе URL и UI расходятся.
    if (tabs.activeTabId) tabs.activateTab(tabs.activeTabId)
  }, [tabs])
  const togglePanel = useCallback(() => {
    setHidden((h) => {
      const next = !h
      if (next === false && tabs.activeTabId) tabs.activateTab(tabs.activeTabId)
      else if (next === true) tabs.clearUrlActive()
      return next
    })
  }, [tabs])
  const hasTabs = tabs.tabs.length > 0 || standaloneTabs.tabs.length > 0

  const closeAll = useCallback(() => {
    tabs.closeAll()
    setStandaloneThread(null)
    standaloneTabs.reset()
  }, [tabs, standaloneTabs])

  const openSystemTab = useCallback<TaskPanelTabbedShellApi['openSystemTab']>(
    (type, title) => {
      userInteractedRef.current = true
      setHidden(false)
      // В standalone — добавляем системную вкладку в in-memory state, не сбрасывая
      // standalone-режим (тред остаётся первой вкладкой).
      if (inStandalone) {
        standaloneTabs.openTab(buildSystemTab(type, title))
        return
      }
      setKnowledgeMode(false)
      tabsOpenTab(buildSystemTab(type, title))
    },
    [tabsOpenTab, inStandalone, standaloneTabs],
  )

  const openKnowledgeArticleTab = useCallback<TaskPanelTabbedShellApi['openKnowledgeArticleTab']>(
    (articleId, title) => {
      userInteractedRef.current = true
      setHidden(false)
      const tab = buildKnowledgeArticleTab(articleId, title)
      // В standalone — статья KB открывается во in-memory TabBar рядом с тредом.
      if (inStandalone) {
        standaloneTabs.openTab(tab)
        return
      }
      // Если уже активен project/contact scope (открыта боковая панель проекта/треда) —
      // статья встраивается туда (вариант D). Если scope пустой (например, открыта
      // общая страница KB без проекта) — переключаемся в knowledge-scope воркспейса
      // (вариант A): пул статей виден везде, где scope также пустой.
      if (activeProjectId || activeContactId) {
        setKnowledgeMode(false)
        tabsOpenTab(tab)
        return
      }
      if (!knowledgeMode) {
        setKnowledgeMode(true)
        setPendingOpen({ tab, projectId: null })
      } else {
        tabsOpenTab(tab)
      }
    },
    [tabsOpenTab, activeProjectId, activeContactId, knowledgeMode, inStandalone, standaloneTabs],
  )

  // Унифицированный closeTab — выбирает источник по текущему режиму.
  // В standalone: если закрыли тред-вкладку (она же primary) → выходим из
  // standalone и скрываем панель.
  const closeTabUnified = useCallback(
    (id: string) => {
      if (inStandalone) {
        const isThreadTab = standaloneThread && id === `thread:${standaloneThread.id}`
        if (isThreadTab) {
          setStandaloneThread(null)
          standaloneTabs.reset()
          setHidden(true)
          return
        }
        standaloneTabs.closeTab(id)
        return
      }
      tabs.closeTab(id)
    },
    [inStandalone, standaloneThread, standaloneTabs, tabs],
  )

  const api: TaskPanelTabbedShellApi = useMemo(
    () => ({
      openThreadTab,
      openProjectTab,
      openSystemTab,
      openKnowledgeArticleTab,
      closeTab: closeTabUnified,
      openTabs: inStandalone ? standaloneTabs.tabs : tabs.tabs,
      closeAll,
      hidePanel,
      showPanel,
      togglePanel,
      isHidden: hidden,
      hasTabs,
      activeThreadId,
      activeProjectRefId,
    }),
    [
      openThreadTab,
      openProjectTab,
      openSystemTab,
      openKnowledgeArticleTab,
      closeTabUnified,
      inStandalone,
      standaloneTabs.tabs,
      tabs.tabs,
      closeAll,
      hidePanel,
      showPanel,
      togglePanel,
      hidden,
      hasTabs,
      activeThreadId,
      activeProjectRefId,
    ],
  )

  const onOpenSystemTab = useCallback(
    (def: SystemTabDef) => {
      // «Все задачи» — это всегда tasks-вкладка ТЕКУЩЕГО проекта (с refId).
      // Без refId её нечем рендерить — поэтому требуется активный projectId.
      // В standalone-режиме нет projectId, так что 'tasks' там недоступна.
      if (def.type === 'tasks') {
        if (!activeProjectId || inStandalone) return
        tabsOpenTab({
          id: `tasks:${activeProjectId}`,
          type: 'tasks',
          refId: activeProjectId,
          title: def.title,
        })
        return
      }
      if (inStandalone) {
        standaloneTabs.openTab(buildSystemTab(def.type, def.title))
        return
      }
      tabsOpenTab(buildSystemTab(def.type, def.title))
    },
    [tabsOpenTab, activeProjectId, inStandalone, standaloneTabs],
  )

  // Эффективные tabs/handlers — в зависимости от режима.
  const effectiveTabs = inStandalone ? standaloneTabs.tabs : tabs.tabs
  const effectiveActiveTabId = inStandalone ? standaloneTabs.activeTabId : tabs.activeTabId
  const effectiveActivate = inStandalone ? standaloneTabs.activateTab : tabs.activateTab
  const effectiveTogglePin = inStandalone ? standaloneTabs.togglePin : tabs.togglePin
  const effectiveReorder = inStandalone ? standaloneTabs.reorderTab : tabs.reorderTab

  const shellElement = (
    <TaskPanelTabbedShellRenderer
      tabs={effectiveTabs}
      activeTab={effectiveActiveTab}
      activeTabId={effectiveActiveTabId}
      onActivate={effectiveActivate}
      onCloseTab={closeTabUnified}
      onOpenSystem={onOpenSystemTab}
      onOpenThreadTab={openThreadTab}
      onHidePanel={hidePanel}
      onTogglePin={effectiveTogglePin}
      onReorderTab={effectiveReorder}
      onSeedTabs={tabs.seedTabs}
      isNewProject={tabs.isNewProject && !inStandalone}
      hidden={hidden}
      workspaceId={workspaceId}
      projectId={activeProjectId}
      contactId={activeProjectId ? null : activeContactId}
      pageProjectId={pageProjectId}
      standaloneThread={standaloneThread}
    />
  )

  return { api, shellElement, hasOpenTabs: tabs.tabs.length > 0 }
}

