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
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { TaskPanelTabBar, type SystemTabDef } from './TaskPanelTabBar'
import { PanelProjectInfoRow } from './PanelProjectInfoRow'
import {
  useTaskPanelTabs,
  buildSystemTab,
  buildThreadTab,
} from './useTaskPanelTabs'
import { useThreadFromPanelTab } from './useThreadFromPanelTab'
import type { TaskPanelTab } from './taskPanelTabs.types'
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import type { TaskItem } from './types'
import type { ProjectHeaderInfo } from './TaskPanel'
import { usePanelTabsVisibility } from './usePanelTabsVisibility'
import {
  ThreadTabContent,
  TasksTabContent,
  SystemTabBody,
} from './TaskPanelTabContents'

interface TaskPanelTabbedShellProps {
  workspaceId: string
  /**
   * projectId текущей страницы — стартовое значение «активного проекта».
   * При открытии треда/проекта другого projectId shell автоматически переключится
   * на его scope (вкладки per-project). На страницах без проекта (/boards, /inbox)
   * передаём null — projectId возьмётся из task.project_id первого открываемого треда.
   */
  pageProjectId: string | null
}

export interface TaskPanelTabbedShellApi {
  /** Открыть тред во вкладке (или активировать существующую). */
  openThreadTab: (task: TaskItem) => void
  /** Открыть «список задач проекта» во вкладке (Mode 2 старого TaskPanel). */
  openProjectTab: (project: ProjectHeaderInfo) => void
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
  // ВАЖНО: применяем только пока activeProjectId === null (первый рендер).
  // Если пользователь УЖЕ кликнул на тред (activeProjectId стал не-null), URL
  // ещё не успел обновиться, и эффект бы возвращал scope обратно на тред из
  // URL — а pendingOpen для нового scope отбрасывался бы (guard ниже),
  // и панель переставала переключаться.
  const resolvedFromUrl = useThreadFromPanelTab(workspaceId)
  useEffect(() => {
    if (!resolvedFromUrl) return
    if (activeProjectId !== null) return
    if (pageProjectId) return // на странице проекта scope уже задан
    // eslint-disable-next-line react-hooks/set-state-in-effect -- scope-resolver: подхватываем projectId из shareable-ссылки на /boards|/inbox
    setActiveProjectId(resolvedFromUrl.projectId)
  }, [resolvedFromUrl, activeProjectId, pageProjectId])

  const tabs = useTaskPanelTabs({ projectId: activeProjectId })

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
    (task: TaskItem) => {
      const targetPid = task.project_id ?? null
      const tab = buildThreadTab(task.id, task.name, {
        threadType: task.type,
        icon: task.icon,
        accentColor: task.accent_color,
      })
      // Открытие нового треда — гарантированно показываем панель.
      setHidden(false)
      if (targetPid !== activeProjectId) {
        setActiveProjectId(targetPid)
        setPendingOpen({ tab, projectId: targetPid })
      } else {
        tabsOpenTab(tab)
      }
    },
    [activeProjectId, tabsOpenTab],
  )

  const openProjectTab = useCallback(
    (project: ProjectHeaderInfo) => {
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
      if (targetPid !== activeProjectId) {
        setActiveProjectId(targetPid)
        setPendingOpen({ tab, projectId: targetPid })
      } else {
        tabsOpenTab(tab)
      }
    },
    [activeProjectId, tabsOpenTab],
  )

  // Активный thread/project из текущей активной вкладки — для подсветки карточек на доске.
  // Когда панель скрыта, подсветку убираем — иначе обводка карточки остаётся после закрытия.
  const activeThreadId =
    !hidden && tabs.activeTab?.type === 'thread' ? (tabs.activeTab.refId ?? null) : null
  const activeProjectRefId =
    !hidden && tabs.activeTab?.type === 'tasks' ? (tabs.activeTab.refId ?? null) : null

  const hidePanel = useCallback(() => setHidden(true), [])
  const showPanel = useCallback(() => setHidden(false), [])
  const togglePanel = useCallback(() => setHidden((h) => !h), [])
  const hasTabs = tabs.tabs.length > 0

  const api: TaskPanelTabbedShellApi = useMemo(
    () => ({
      openThreadTab,
      openProjectTab,
      closeTab: tabs.closeTab,
      openTabs: tabs.tabs,
      closeAll: tabs.closeAll,
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
      tabs.closeTab,
      tabs.tabs,
      tabs.closeAll,
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
      if (def.type === 'tasks') {
        if (!activeProjectId) return
        tabsOpenTab({
          id: `tasks:${activeProjectId}`,
          type: 'tasks',
          refId: activeProjectId,
          title: def.title,
        })
        return
      }
      tabsOpenTab(buildSystemTab(def.type, def.title))
    },
    [tabsOpenTab, activeProjectId],
  )

  const shellElement = (
    <TaskPanelTabbedShellRenderer
      tabs={tabs.tabs}
      activeTab={tabs.activeTab}
      activeTabId={tabs.activeTabId}
      onActivate={tabs.activateTab}
      onCloseTab={tabs.closeTab}
      onOpenSystem={onOpenSystemTab}
      onOpenThreadTab={openThreadTab}
      onHidePanel={hidePanel}
      onTogglePin={tabs.togglePin}
      onReorderTab={tabs.reorderTab}
      onSeedTabs={tabs.seedTabs}
      isNewProject={tabs.isNewProject}
      hidden={hidden}
      workspaceId={workspaceId}
      projectId={activeProjectId}
      pageProjectId={pageProjectId}
    />
  )

  return { api, shellElement, hasOpenTabs: tabs.tabs.length > 0 }
}

interface RendererProps {
  tabs: TaskPanelTab[]
  activeTab: TaskPanelTab | null
  activeTabId: string | null
  onActivate: (id: string) => void
  onCloseTab: (id: string) => void
  onOpenSystem: (def: SystemTabDef) => void
  onOpenThreadTab: (task: TaskItem) => void
  onHidePanel: () => void
  onTogglePin: (id: string) => void
  onReorderTab: (activeId: string, overId: string | null, pinned: boolean) => void
  /** Засеять дефолтный набор вкладок (вызывается один раз для нового проекта). */
  onSeedTabs: (seed: TaskPanelTab[]) => void
  /** Признак "для пары проект/пользователь нет записи" — можно сеять дефолты. */
  isNewProject: boolean
  hidden: boolean
  workspaceId: string
  /** Активный projectId scope-а вкладок. */
  projectId: string | null
  /** projectId страницы, на которой находится пользователь. */
  pageProjectId: string | null
}

function TaskPanelTabbedShellRenderer({
  tabs,
  activeTab,
  activeTabId,
  onActivate,
  onCloseTab,
  onOpenSystem,
  onOpenThreadTab,
  onHidePanel,
  onTogglePin,
  onReorderTab,
  onSeedTabs,
  isNewProject,
  hidden,
  workspaceId,
  projectId,
  pageProjectId,
}: RendererProps) {
  // Видимость системных вкладок по правам пользователя в текущем scope (project).
  const visibleSystemTypes = usePanelTabsVisibility(workspaceId, projectId)

  // Дефолтные вкладки для нового проекта: «Задачи» и «История» — закреплённые.
  // Сеется один раз — при первом открытии панели в проекте, если в БД ещё нет
  // записи task_panel_tabs для этой пары user/project и пользователь имеет доступ
  // к этим разделам. После сидинга isNewProject становится false.
  const seedDoneRef = useRef<string | null>(null)
  useEffect(() => {
    if (!projectId) return
    if (!isNewProject) return
    if (tabs.length > 0) return
    if (seedDoneRef.current === projectId) return
    const wantsTasks = visibleSystemTypes.has('tasks')
    const wantsHistory = visibleSystemTypes.has('history')
    if (!wantsTasks && !wantsHistory) return
    const seed: TaskPanelTab[] = []
    if (wantsTasks) seed.push({ ...buildSystemTab('tasks', 'Задачи'), pinned: true })
    if (wantsHistory) seed.push({ ...buildSystemTab('history', 'История'), pinned: true })
    seedDoneRef.current = projectId
    onSeedTabs(seed)
  }, [projectId, isNewProject, tabs.length, visibleSystemTypes, onSeedTabs])
  // Фильтруем уже открытые вкладки: если user потерял доступ к системному
  // разделу (например, перешёл в проект где модуля нет) — скрываем эту
  // вкладку из бара. Сама запись в БД остаётся: при переключении scope обратно
  // в проект где доступ есть — вкладка снова появится.
  // Свежие данные тредов текущего scope-проекта — название, accent_color, icon.
  // tab.meta это снапшот на момент открытия вкладки и устаревает после изменения
  // настроек чата (диалог «Настройки» → название/цвет/иконка). Подмешиваем актуальные
  // значения из БД, чтобы вкладки в баре сразу отражали изменения.
  const { data: scopeThreads = [] } = useProjectThreads(projectId ?? undefined)
  const freshThreadById = useMemo(
    () => new Map(scopeThreads.map((t) => [t.id, t])),
    [scopeThreads],
  )

  const visibleTabs = useMemo(
    () =>
      tabs
        .filter((t) => {
          if (t.type === 'thread' || t.type === 'tasks') return true // RLS отрулит
          return visibleSystemTypes.has(t.type)
        })
        .map((t) => {
          if (t.type !== 'thread' || !t.refId) return t
          const fresh = freshThreadById.get(t.refId)
          if (!fresh) return t
          return {
            ...t,
            title: fresh.name,
            meta: { ...t.meta, accentColor: fresh.accent_color, icon: fresh.icon },
          }
        }),
    [tabs, visibleSystemTypes, freshThreadById],
  )
  // Карта бейджа по thread_id — для индикации на thread-вкладках.
  // Используем getBadgeDisplay из @/utils/inboxUnread — единый источник правды,
  // он же считает бейджи для сайдбара, списка задач и inbox. Возвращает структуру:
  // number / dot (manually_unread без активности) / emoji / none.
  const { data: inboxThreads = [] } = useInboxThreadsV2(workspaceId)
  const badgeByThreadId = useMemo(() => {
    const map: Record<string, BadgeDisplay> = {}
    for (const t of inboxThreads) {
      const display = getBadgeDisplay(t)
      if (display.type !== 'none') map[t.thread_id] = display
    }
    return map
  }, [inboxThreads])
  // Один persistent .side-panel контейнер. Анимация въезда срабатывает только
  // при первом появлении (tabs.length: 0 → >0). Переключение между вкладками
  // не размонтирует контейнер — меняется только содержимое.
  // hidden=true прячет панель UI, но не трогает вкладки в БД.
  const open = tabs.length > 0 && !hidden
  const [painted, setPainted] = useState(false)
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс painted при закрытии панели; альтернатива (key-based remount) ломает анимацию
      setPainted(false)
      return
    }
    const id = requestAnimationFrame(() => setPainted(true))
    document.body.setAttribute('data-task-panel-open', '')
    return () => {
      cancelAnimationFrame(id)
      document.body.removeAttribute('data-task-panel-open')
    }
  }, [open])
  const visible = open && painted

  const portalRoot = typeof document !== 'undefined' ? document.getElementById('workspace-panel-root') : null

  // Контент активной вкладки. Все рендереры возвращают «голое» содержимое
  // без обёртки .side-panel — обёртка живёт здесь и не размонтируется.
  // Если активная вкладка стала недоступной по правам — показываем заглушку.
  const activeTabAccessible =
    !activeTab ||
    activeTab.type === 'thread' ||
    activeTab.type === 'tasks' ||
    visibleSystemTypes.has(activeTab.type)
  let activeContent: React.ReactNode = null
  if (activeTab && !activeTabAccessible) {
    activeContent = (
      <div className="flex-1 flex items-center justify-center p-6 text-sm text-muted-foreground text-center">
        Нет доступа к этому разделу.
      </div>
    )
  } else if (activeTab) {
    if (activeTab.type === 'thread' && activeTab.refId) {
      activeContent = (
        <ThreadTabContent
          key={`thread:${activeTab.refId}`}
          threadId={activeTab.refId}
          workspaceId={workspaceId}
          onClose={onHidePanel}
        />
      )
    } else if (activeTab.type === 'tasks' && activeTab.refId) {
      activeContent = (
        <TasksTabContent
          key={`tasks:${activeTab.refId}`}
          projectId={activeTab.refId}
          workspaceId={workspaceId}
          onClose={onHidePanel}
          onOpenThreadInTab={onOpenThreadTab}
        />
      )
    } else {
      activeContent = (
        <SystemTabBody
          key={`sys:${activeTab.id}`}
          tab={activeTab}
          projectId={projectId}
          workspaceId={workspaceId}
          onOpenThread={onOpenThreadTab}
        />
      )
    }
  }

  // Шапка боковой панели прячется, когда панель открыта на той же странице
  // проекта, что и текущая страница, — иначе она дублирует шапку страницы.
  const infoRowVisible = !!projectId && pageProjectId !== projectId

  const panel = (
    <div
      className={cn(
        'side-panel flex flex-col z-50',
        'transition-transform duration-200 ease-out',
        !open && 'hidden',
        visible ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Строка 1: информация о проекте текущего scope. Если scope-проект
          совпадает с открытой страницей — строку прячем (дубль шапки страницы),
          и тогда «×» уезжает в TabBar. */}
      {infoRowVisible && (
        <PanelProjectInfoRow
          projectId={projectId!}
          workspaceId={workspaceId}
          onHidePanel={onHidePanel}
        />
      )}
      {/* Строка 2: ряд открытых вкладок + меню добавления + (если шапки нет)
          кнопка «скрыть панель». Учтена видимость по правам — недоступные
          системные вкладки скрываются из бара и из меню. */}
      <TaskPanelTabBar
        tabs={visibleTabs}
        activeTabId={activeTabId}
        onActivate={onActivate}
        onClose={onCloseTab}
        onOpenSystem={onOpenSystem}
        badgeByThreadId={badgeByThreadId}
        visibleSystemTypes={visibleSystemTypes}
        onHidePanel={infoRowVisible ? undefined : onHidePanel}
        onTogglePin={onTogglePin}
        onReorder={onReorderTab}
      />
      {/* Строка 3+: содержимое активной вкладки (со своей шапкой).
          Рендерим только когда панель открыта — иначе Tiptap-редактор
          (ComposeField) инициализируется в hidden-контейнере с display:none,
          получает 0×0 и после показа панели остаётся неотзывчивым к кликам. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {open && activeContent}
      </div>
    </div>
  )

  if (!portalRoot) return panel
  return createPortal(panel, portalRoot)
}
