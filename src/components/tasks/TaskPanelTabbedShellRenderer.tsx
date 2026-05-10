"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { STALE_TIME, threadScopeKeys } from '@/hooks/queryKeys'
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import { PanelProjectInfoRow } from './PanelProjectInfoRow'
import { PanelContactInfoRow } from './PanelContactInfoRow'
import { TaskPanelTabBar, type SystemTabDef } from './TaskPanelTabBar'
import { buildSystemTab } from './useTaskPanelTabs'
import {
  ThreadTabContent,
  TasksTabContent,
  SystemTabBody,
} from './TaskPanelTabContents'
import { usePanelTabsVisibility } from './usePanelTabsVisibility'
import type { TaskPanelTab } from './taskPanelTabs.types'
import type { TaskItem } from './types'

export interface RendererProps {
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
  /** Активный contactId scope-а вкладок (только если projectId=null). */
  contactId: string | null
  /** projectId страницы, на которой находится пользователь. */
  pageProjectId: string | null
}

export
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
  contactId,
  pageProjectId,
}: RendererProps) {
  // Видимость системных вкладок по правам пользователя в текущем scope (project).
  const visibleSystemTypes = usePanelTabsVisibility(workspaceId, projectId)

  // Резолвим scope активной thread-вкладки из БД (для корректной шапки даже
  // когда tab открыт не через openThreadTab, а через activateTab из TabBar).
  const activeThreadRefId =
    activeTab?.type === 'thread' ? (activeTab.refId ?? null) : null
  const { data: activeThreadScope } = useQuery<{
    project_id: string | null
    contact_participant_id: string | null
  } | null>({
    queryKey: threadScopeKeys.byThread(activeThreadRefId ?? ''),
    enabled: !!activeThreadRefId,
    staleTime: STALE_TIME.MEDIUM,
    queryFn: async () => {
      if (!activeThreadRefId) return null
      const { data, error } = await supabase
        .from('project_threads')
        .select('project_id, contact_participant_id')
        .eq('id', activeThreadRefId)
        .maybeSingle()
      if (error) throw error
      return (data as { project_id: string | null; contact_participant_id: string | null } | null) ?? null
    },
  })

  // Эффективный scope для шапки: если активная вкладка — тред без проекта,
  // но с контактом → показываем contact chip. Иначе fallback на пропы.
  const effectiveProjectId = activeThreadScope?.project_id ?? projectId
  const effectiveContactId = effectiveProjectId
    ? null
    : (activeThreadScope?.contact_participant_id ?? contactId)

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
  // Для contact-scope шапка показывается всегда.
  const infoRowVisible =
    !!effectiveContactId ||
    (!!effectiveProjectId && pageProjectId !== effectiveProjectId)

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
        effectiveContactId ? (
          <PanelContactInfoRow
            contactId={effectiveContactId}
            workspaceId={workspaceId}
            onHidePanel={onHidePanel}
          />
        ) : (
          <PanelProjectInfoRow
            projectId={effectiveProjectId!}
            workspaceId={workspaceId}
            onHidePanel={onHidePanel}
          />
        )
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
