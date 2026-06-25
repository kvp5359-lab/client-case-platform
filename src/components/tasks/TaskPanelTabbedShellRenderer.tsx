"use client"

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { STALE_TIME, threadScopeKeys } from '@/hooks/queryKeys'
import { useInboxThreadsV2 } from '@/hooks/messenger/useInbox'
import { useFilteredInboxAggregates } from '@/hooks/messenger/useFilteredInbox'
import { useProjectThreads } from '@/hooks/messenger/useProjectThreads'
import { getBadgeDisplay, type BadgeDisplay } from '@/utils/inboxUnread'
import { PanelProjectInfoRow } from './PanelProjectInfoRow'
import { PanelContactInfoRow } from './PanelContactInfoRow'
import { PanelStandaloneInfoRow } from './PanelStandaloneInfoRow'
import { TaskPanelTabBar, type SystemTabDef } from './TaskPanelTabBar'
import { buildSystemTab, buildThreadTab } from './useTaskPanelTabs'
import {
  isDefaultPanelTabsArray,
  SYSTEM_PANEL_TAB_LABELS,
  type DefaultPanelTabItem,
} from '@/components/templates/project-template-editor/panelTabsTypes'
import { projectTemplateKeys } from '@/hooks/queryKeys'
import {
  ThreadTabContent,
  TasksTabContent,
  SystemTabBody,
} from './TaskPanelTabContents'
import { KnowledgeArticleTabContent } from './KnowledgeArticleTabContent'
import { usePanelTabsVisibility } from './usePanelTabsVisibility'
import type { TaskPanelTab } from '@/types/taskPanelTabs'
import type { TaskItem } from './types'

export type RendererProps = {
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
  /** Standalone-режим: тред без project_id и без contact_participant_id.
   *  Если задан — рендерим ОДИН тред без TabBar и без info-row; tabs/activeTab
   *  игнорируются. Это нужно чтобы «внутренние задачи» (без проекта и контакта)
   *  не сваливались в общий глобальный pool task_panel_tabs. */
  standaloneThread: TaskItem | null
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
  standaloneThread,
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

  // Дефолтный набор вкладок берётся из шаблона проекта
  // (`project_templates.default_panel_tabs`). Если в шаблоне это поле NULL —
  // legacy-поведение: tasks + history. Если массив — используем как есть,
  // отфильтровав по правам и отрезолвив thread_template_id → thread.id через
  // scopeThreads (project_threads.source_template_id).
  const { data: projectDefaults } = useQuery<{
    template_id: string | null
    default_panel_tabs: unknown
  } | null>({
    queryKey: projectTemplateKeys.defaultPanelTabsByProject(projectId ?? ''),
    enabled: !!projectId && isNewProject,
    staleTime: STALE_TIME.LONG,
    queryFn: async () => {
      if (!projectId) return null
      const { data, error } = await supabase
        .from('projects')
        .select('template_id, project_templates(default_panel_tabs)')
        .eq('id', projectId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const tpl = (data as { project_templates: { default_panel_tabs: unknown } | null }).project_templates
      return {
        template_id: (data as { template_id: string | null }).template_id,
        default_panel_tabs: tpl?.default_panel_tabs ?? null,
      }
    },
  })
  // Загружаем треды только если в шаблоне могут быть треды для резолва —
  // обычный useProjectThreads ниже уже подтянут, переиспользуем его данные.
  const seedDoneRef = useRef<string | null>(null)
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

  // Сеялка дефолтных вкладок для нового проекта. Вызывается один раз — при
  // первом открытии панели в проекте, если в БД ещё нет строки task_panel_tabs.
  // Источник списка — `project_templates.default_panel_tabs` шаблона проекта.
  // NULL → legacy-дефолт (Задачи + История). Массив → разворачиваем как есть.
  useEffect(() => {
    if (!projectId) return
    if (!isNewProject) return
    if (tabs.length > 0) return
    if (seedDoneRef.current === projectId) return
    if (projectDefaults === undefined) return // ждём загрузку
    // threads нужны только если в шаблоне есть thread_template — иначе сидим без них.
    const raw = projectDefaults?.default_panel_tabs
    const items: DefaultPanelTabItem[] | null = isDefaultPanelTabsArray(raw)
      ? raw
      : null

    // Legacy-дефолт когда поле NULL: tasks + history.
    const effectiveItems: DefaultPanelTabItem[] =
      items ??
      [
        { type: 'system', key: 'tasks' },
        { type: 'system', key: 'history' },
      ]

    // Пустой массив [] = пользователь явно сказал «ничего не закреплять».
    if (effectiveItems.length === 0) {
      seedDoneRef.current = projectId
      return
    }

    // Резолв thread_template_id → существующий thread в проекте.
    const threadBySourceTemplate = new Map<string, (typeof scopeThreads)[number]>()
    for (const th of scopeThreads) {
      if (th.source_template_id) threadBySourceTemplate.set(th.source_template_id, th)
    }

    // Если для thread-элемента ещё не создан соответствующий тред (создание
    // проекта асинхронно делает треды) — ждём следующего рендера, не сидим
    // неполным списком. Это терпимо: после первого появления тредов мы засеем.
    const hasThreadTpl = effectiveItems.some((i) => i.type === 'thread_template')
    const allThreadTplsResolved =
      !hasThreadTpl ||
      effectiveItems
        .filter((i): i is { type: 'thread_template'; id: string } => i.type === 'thread_template')
        .every((i) => threadBySourceTemplate.has(i.id))
    if (!allThreadTplsResolved) return

    const seed: TaskPanelTab[] = []
    for (const item of effectiveItems) {
      if (item.type === 'system') {
        if (!visibleSystemTypes.has(item.key)) continue
        // Системная вкладка 'tasks' должна нести refId = projectId, иначе
        // рендер не сможет показать список задач (требуется projectId для
        // загрузки проекта). Остальные системные типы рендерятся через
        // SystemTabBody и refId им не нужен.
        const base = buildSystemTab(item.key, SYSTEM_PANEL_TAB_LABELS[item.key])
        seed.push({
          ...base,
          ...(item.key === 'tasks' && projectId ? { id: `tasks:${projectId}`, refId: projectId } : {}),
          pinned: true,
        })
      } else {
        const th = threadBySourceTemplate.get(item.id)
        if (!th) continue
        seed.push({
          ...buildThreadTab(th.id, th.name, {
            threadType: th.type,
            icon: th.icon,
            accentColor: th.accent_color,
          }),
          pinned: true,
        })
      }
    }

    if (seed.length === 0) {
      seedDoneRef.current = projectId
      return
    }

    seedDoneRef.current = projectId
    onSeedTabs(seed)
  }, [
    projectId,
    isNewProject,
    tabs.length,
    visibleSystemTypes,
    onSeedTabs,
    projectDefaults,
    scopeThreads,
  ])

  const visibleTabs = useMemo(
    () =>
      tabs
        .filter((t) => {
          // RLS отрулит права на тред/проект/статью. Системные вкладки
          // фильтруются по модулям проекта.
          if (t.type === 'thread' || t.type === 'tasks' || t.type === 'knowledge_article') return true
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
  // Держим inboxKeys.threads тёплым на странице проекта — его читают
  // counterpart-имена (P4b), mark-read патчи кэша, threadCacheSync и др.
  useInboxThreadsV2(workspaceId)
  // Карта бейджа по thread_id для thread-вкладок. Источник — ПОЛНЫЙ кэш
  // агрегатов (get_inbox_thread_aggregates, без пагинации), а НЕ пагинированный
  // inboxKeys.threads (только первая страница ~50): иначе у вкладки с тредом со
  // 2-й+ страницы инбокса бейдж пропадал. getBadgeDisplay — единый источник.
  const { data: aggregates = [] } = useFilteredInboxAggregates(workspaceId)
  const badgeByThreadId = useMemo(() => {
    const map: Record<string, BadgeDisplay> = {}
    for (const t of aggregates) {
      const display = getBadgeDisplay(t)
      if (display.type !== 'none') map[t.thread_id] = display
    }
    return map
  }, [aggregates])
  // Один persistent .side-panel контейнер. Анимация въезда срабатывает только
  // при первом появлении (tabs.length: 0 → >0). Переключение между вкладками
  // не размонтирует контейнер — меняется только содержимое.
  // hidden=true прячет панель UI, но не трогает вкладки в БД.
  const open = tabs.length > 0 && !hidden
  const [painted, setPainted] = useState(false)
  // render держится ещё 300мс после закрытия — чтобы проиграть слайд ВЫЕЗДА
  // (translate-x-full). Без этого `hidden` срабатывал мгновенно и анимации
  // закрытия не было видно. Та же скорость, что у чат-панели инбокса (300мс).
  const [render, setRender] = useState(open)
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- сброс painted → слайд выезда
      setPainted(false)
      const t = setTimeout(() => setRender(false), 300)
      return () => clearTimeout(t)
    }
    setRender(true)
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
    activeTab.type === 'knowledge_article' ||
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
    } else if (activeTab.type === 'knowledge_article' && activeTab.refId) {
      activeContent = (
        <KnowledgeArticleTabContent
          key={`knowledge_article:${activeTab.refId}`}
          articleId={activeTab.refId}
          onClose={onHidePanel}
        />
      )
    } else if (activeTab.type === 'tasks' && (activeTab.refId || projectId)) {
      // Фолбэк на projectId scope-а для legacy-записей в БД, где сеялка
      // (до фикса 2026-05-15) сохраняла tasks-вкладку без refId.
      const tasksProjectId = activeTab.refId ?? projectId!
      activeContent = (
        <TasksTabContent
          key={`tasks:${tasksProjectId}`}
          projectId={tasksProjectId}
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
          standaloneThreadId={standaloneThread?.id}
          onOpenThread={onOpenThreadTab}
        />
      )
    }
  }

  // Шапка боковой панели прячется, когда панель открыта на той же странице
  // проекта, что и текущая страница, — иначе она дублирует шапку страницы.
  // Для contact-scope шапка показывается всегда.
  // Для standalone — отдельная шапка PanelStandaloneInfoRow рендерится ниже.
  const infoRowVisible =
    !standaloneThread &&
    (!!effectiveContactId ||
      (!!effectiveProjectId && pageProjectId !== effectiveProjectId))

  const panel = (
    <div
      className={cn(
        'side-panel flex flex-col z-50',
        'transition-transform duration-300 ease-out',
        !render && 'hidden',
        visible ? 'translate-x-0' : 'translate-x-full',
      )}
    >
      {/* Строка 1: информация о текущем scope панели.
          - standalone (personal dialog / тред без контекста) — имя треда + ×
          - contact-тред — карточка контакта + ×
          - project-тред (если scope-проект ≠ открытой странице) — карточка проекта + ×
          Если scope-проект совпадает с открытой страницей, строку прячем
          (дубль шапки страницы), и тогда «×» уезжает в TabBar. */}
      {standaloneThread ? (
        <PanelStandaloneInfoRow thread={standaloneThread} onHidePanel={onHidePanel} />
      ) : infoRowVisible ? (
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
      ) : null}
      {/* Строка 2: ряд открытых вкладок + меню добавления + (если шапки нет)
          кнопка «скрыть панель». Учтена видимость по правам — недоступные
          системные вкладки скрываются из бара и из меню.
          В standalone-режиме TabBar тоже рендерится, но из in-memory state —
          можно открыть рядом с диалогом ассистента, KB-статью и т.п. */}
      <TaskPanelTabBar
        tabs={visibleTabs}
        activeTabId={activeTabId}
        onActivate={onActivate}
        onClose={onCloseTab}
        onOpenSystem={onOpenSystem}
        badgeByThreadId={badgeByThreadId}
        visibleSystemTypes={visibleSystemTypes}
        onHidePanel={infoRowVisible || standaloneThread ? undefined : onHidePanel}
        onTogglePin={onTogglePin}
        onReorder={onReorderTab}
      />
      {/* Строка 3+: содержимое активной вкладки (со своей шапкой).
          Рендерим только когда панель открыта — иначе Tiptap-редактор
          (ComposeField) инициализируется в hidden-контейнере с display:none,
          получает 0×0 и после показа панели остаётся неотзывчивым к кликам. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {render && activeContent}
      </div>
    </div>
  )

  if (!portalRoot) return panel
  return createPortal(panel, portalRoot)
}
