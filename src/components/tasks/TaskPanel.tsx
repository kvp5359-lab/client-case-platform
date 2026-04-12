"use client"

/**
 * TaskPanel — правая боковая панель для просмотра треда или проекта.
 * Открывается поверх основной правой панели (sidebar) с тем же размером.
 *
 * ── Два режима содержимого ──
 *
 * **Режим 1 — открытый тред (`stackTop.kind === 'task'`)**
 *   Шапка: статус, иконка, название, исполнители, настройки, дедлайн, ссылка на проект,
 *   кнопка «Другие задачи».
 *   Тело: MessengerTabContent (сообщения треда).
 *
 * **Режим 2 — открытый проект (`stackTop.kind === 'project'`)**
 *   Шапка: иконка проекта + название + ссылка «Открыть проект».
 *   Тело: TaskListView с projectId (список всех задач проекта).
 *
 * Переключение между режимами — через стек в useTaskPanelSetup.
 * Кнопка «Другие задачи» в Mode 1 кладёт проект поверх стека → панель переключается
 * в Mode 2, задача остаётся ниже в стеке. Кнопка «назад» возвращает к задаче.
 * Клик по задаче в списке Mode 2 кладёт задачу поверх стека — так же через стек.
 */

import { useState, useCallback, useRef, useEffect, createElement, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Check, Settings, ExternalLink, X, Mail, ArrowLeft, ListTree, FolderOpen } from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { TaskPanelContext, useLayoutTaskPanel } from './TaskPanelContext'
import { formatSmartDate } from '@/utils/format/dateFormat'

// TaskListView импортируется лениво, чтобы избежать циклической зависимости:
// TaskListView → TaskPanel → TaskListView. Нужен и для Режима 2 (тело панели
// со списком задач проекта), и исторически — для оверлея «Другие задачи»
// (теперь удалён, но зависимость всё равно циклическая).
const TaskListView = lazy(() =>
  import('./TaskListView').then((m) => ({ default: m.TaskListView })),
)

const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
import { useProjectThreadById } from '@/hooks/messenger/useProjectThreads'
import type { TaskItem } from './types'

/** Минимальная информация о проекте для шапки Режима 2. */
export interface ProjectHeaderInfo {
  id: string
  name: string
  created_at?: string | null
  description?: string | null
}

/** Элемент стека панели: либо задача, либо проект. */
export type PanelStackItem =
  | { kind: 'task'; task: TaskItem }
  | { kind: 'project'; project: ProjectHeaderInfo }

export interface TaskPanelProps {
  /** Верхний элемент стека — определяет режим и содержимое панели. */
  stackTop: PanelStackItem | null
  open: boolean
  onClose: () => void
  workspaceId: string
  statuses?: StatusOption[]
  members?: AvatarParticipant[]
  onStatusChange?: (statusId: string | null) => void
  onDeadlineSet?: (date: Date) => void
  onDeadlineClear?: () => void
  onRename: (name: string) => void
  onSettingsSave: (params: { name: string; accent_color: string; icon: string }) => void
  deadlinePending?: boolean
  settingsPending: boolean
  /** Показывать ссылку на проект (на странице «Все задачи») */
  showProjectLink?: boolean
  /** Callback при клике на ссылку проекта (в Mode 1) */
  onProjectClick?: () => void
  /** Вернуться на один шаг назад по стеку. Если undefined — кнопка скрыта. */
  onBack?: () => void
  /** Есть ли предыдущий элемент в стеке (кнопка «назад» активна). */
  canGoBack?: boolean
  /** Положить тред поверх стека — вызывается из встроенного TaskListView. */
  onOpenThreadInStack?: (task: TaskItem) => void
  /** Положить проект поверх стека — вызывается кнопкой «Другие задачи» в задаче. */
  onOpenProjectInStack?: (project: ProjectHeaderInfo) => void
}

export function TaskPanel({
  stackTop,
  open,
  onClose,
  workspaceId,
  statuses = [],
  members = [],
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onRename,
  onSettingsSave,
  deadlinePending = false,
  settingsPending,
  showProjectLink: _showProjectLink,
  onProjectClick,
  onBack,
  canGoBack = false,
  onOpenThreadInStack,
  onOpenProjectInStack,
}: TaskPanelProps) {
  const router = useRouter()
  const parentPanelCtx = useLayoutTaskPanel()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])

  const task = stackTop?.kind === 'task' ? stackTop.task : null
  const projectItemRaw = stackTop?.kind === 'project' ? stackTop.project : null
  const mode: 'task' | 'project' | null = stackTop ? stackTop.kind : null

  // Если проект пришёл с неполными данными (например, из кнопки «Другие задачи»,
  // где на входе был только id и name) — дотягиваем created_at и description
  // ленивым запросом. Загружаем только недостающие поля.
  const [fetchedProjectMeta, setFetchedProjectMeta] = useState<{
    id: string
    created_at: string | null
    description: string | null
  } | null>(null)
  const needProjectMeta =
    projectItemRaw !== null &&
    (projectItemRaw.created_at === undefined || projectItemRaw.description === undefined)
  useEffect(() => {
    if (!needProjectMeta || !projectItemRaw) return
    if (fetchedProjectMeta?.id === projectItemRaw.id) return
    let cancelled = false
    supabase
      .from('projects')
      .select('id, created_at, description')
      .eq('id', projectItemRaw.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return
        setFetchedProjectMeta({
          id: data.id,
          created_at: data.created_at,
          description: data.description,
        })
      })
    return () => {
      cancelled = true
    }
  }, [needProjectMeta, projectItemRaw, fetchedProjectMeta?.id])

  const projectItem = projectItemRaw
    ? {
        ...projectItemRaw,
        created_at:
          projectItemRaw.created_at ??
          (fetchedProjectMeta?.id === projectItemRaw.id ? fetchedProjectMeta.created_at : null),
        description:
          projectItemRaw.description ??
          (fetchedProjectMeta?.id === projectItemRaw.id ? fetchedProjectMeta.description : null),
      }
    : null

  // Inline-редактирование названия (только в Mode 1)
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  const editNameRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  /** Замер левой границы названия для выравнивания второй строки шапки.
      Ширина статуса + кнопка «назад» + разделители зависят от состояния,
      поэтому вместо фиксированного w-* отступа вычисляем реальный offset. */
  const titleRef = useRef<HTMLHeadingElement>(null)
  const headerRowRef = useRef<HTMLDivElement>(null)
  const [titleOffset, setTitleOffset] = useState(0)

  // Полный ProjectThread подгружаем только когда юзер открывает настройки:
  // TaskItem не содержит access_type / access_roles / legacy_channel и др.
  // полей, без которых ChatSettingsDialog не может восстановить состояние
  // «Кто видит чат» и не подгружает участников.
  const { data: fullThread } = useProjectThreadById(task?.id, settingsOpen)

  // Загрузка project_name (только для Mode 1):
  // - Если task.project_name уже передан — берём его синхронно (derived).
  // - Иначе запрашиваем из БД в эффекте и кладём в fetchedProjectName.
  const [fetchedProjectName, setFetchedProjectName] = useState<string | null>(null)
  useEffect(() => {
    if (!task?.project_id || task.project_name) return
    let cancelled = false
    supabase
      .from('projects')
      .select('name')
      .eq('id', task.project_id)
      .single()
      .then(({ data }) => {
        if (!cancelled) setFetchedProjectName(data?.name ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [task?.project_id, task?.project_name])
  const resolvedProjectName = task?.project_name ?? (task?.project_id ? fetchedProjectName : null)

  // Анимация «въезда». painted включается через rAF после open=true,
  // чтобы Tailwind-переход translate-x мог сработать с первого кадра.
  // Сброс при закрытии — через derived-update по tracked previous `open`,
  // чтобы не вызывать setState напрямую в useEffect-ветке (set-state-in-effect).
  const [painted, setPainted] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) setPainted(false)
  }
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => setPainted(true))
    document.body.setAttribute('data-task-panel-open', '')
    return () => {
      cancelAnimationFrame(id)
      document.body.removeAttribute('data-task-panel-open')
    }
  }, [open])
  const visible = open && painted

  const isTask = task?.type === 'task'
  const isEmail = task !== null && !isTask && (task?.contact_emails?.length ?? 0) > 0

  // Закрытие по Escape
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsOpen) return
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, settingsOpen])

  const startEditName = () => {
    if (!task) return
    setEditNameValue(task.name)
    setEditingName(true)
  }

  useEffect(() => {
    if (editingName && editNameRef.current) {
      editNameRef.current.focus()
      editNameRef.current.select()
    }
  }, [editingName])

  // Замер реальной левой границы названия — для выравнивания второй строки шапки.
  useEffect(() => {
    if (!open) return
    const titleEl = titleRef.current
    const rowEl = headerRowRef.current
    if (!titleEl || !rowEl) return
    const measure = () => {
      const titleRect = titleEl.getBoundingClientRect()
      const rowRect = rowEl.getBoundingClientRect()
      setTitleOffset(Math.max(0, titleRect.left - rowRect.left))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(rowEl)
    ro.observe(titleEl)
    return () => ro.disconnect()
  }, [open, task?.id, task?.name, canGoBack, editingName, mode])

  const commitEditName = () => {
    const trimmed = editNameValue.trim()
    if (trimmed && task && trimmed !== task.name) {
      onRename(trimmed)
    }
    setEditingName(false)
  }

  // Сброс inline-редактирования при смене задачи.
  // Derived state during render — устраняет cascading-рендер useEffect+setState.
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setEditingName(false)
  }

  if (!open || !stackTop) return null

  // ── Режим 2: проект ──────────────────────────────────────
  if (mode === 'project' && projectItem) {
    const projectHref = `/workspaces/${workspaceId}/projects/${projectItem.id}`

    const panel = (
      <TaskPanelContext.Provider
        value={{
          // Клик по задаче в списке внутри Mode 2 → push задачи поверх стека,
          // чтобы проект остался ниже и пользователь мог вернуться кнопкой «назад».
          openThread: (next) => {
            if (onOpenThreadInStack) onOpenThreadInStack(next)
          },
          pushThread: (next) => {
            if (onOpenThreadInStack) onOpenThreadInStack(next)
          },
          closeThread: parentPanelCtx?.closeThread ?? onClose,
          isInsidePanel: true,
        }}
      >
        <div
          ref={panelRef}
          className={cn(
            'side-panel flex flex-col z-50',
            'transition-transform duration-200 ease-out',
            visible ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          {/* Шапка проекта */}
          <div className="border-b shrink-0 flex flex-col py-2 gap-0.5">
            {/* Строка 1: назад / иконка / название / действия */}
            <div className="flex items-center gap-2 px-4 min-h-[32px]">
              {canGoBack && onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  title="Назад"
                  aria-label="Назад"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}

              <FolderOpen className="w-4 h-4 shrink-0 text-muted-foreground" />

              <h2 className="text-base font-semibold leading-tight truncate min-w-0 flex-1">
                {projectItem.name}
              </h2>

              <a
                href={projectHref}
                onClick={(e) => {
                  if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault()
                    router.push(projectHref)
                  }
                }}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Открыть проект"
                aria-label="Открыть проект"
              >
                <ExternalLink className="w-4 h-4" />
              </a>

              <button
                type="button"
                onClick={onClose}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Закрыть"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Строка 2: дата создания + описание (комментарий).
                Левый отступ подобран так, чтобы текст начинался под названием
                проекта (после кнопки «назад», если есть, и иконки папки). */}
            {(projectItem.created_at || projectItem.description) && (
              <div
                className={cn(
                  'flex items-center gap-2 pr-4 text-xs text-muted-foreground/70 min-w-0',
                  canGoBack ? 'pl-[72px]' : 'pl-[44px]',
                )}
              >
                {projectItem.created_at && (
                  <span className="shrink-0">
                    Создан {formatSmartDate(projectItem.created_at)}
                  </span>
                )}
                {projectItem.created_at && projectItem.description && (
                  <span className="shrink-0 opacity-40">•</span>
                )}
                {projectItem.description && (
                  <span className="truncate" title={projectItem.description}>
                    {projectItem.description}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Тело: список задач проекта */}
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="p-4">
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    Загрузка…
                  </div>
                }
              >
                <TaskListView
                  workspaceId={workspaceId}
                  projectId={projectItem.id}
                  showProject={false}
                  showProjectLink={false}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </TaskPanelContext.Provider>
    )

    const portalRoot = document.getElementById('workspace-panel-root')
    if (!portalRoot) return panel
    return createPortal(panel, portalRoot)
  }

  // ── Режим 1: тред ────────────────────────────────────────
  if (!task) return null

  const ThreadIcon = getChatIconComponent(task.icon)

  const panel = (
    <>
      <div
        ref={panelRef}
        className={cn(
          'side-panel flex flex-col z-50',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Шапка */}
        <div className="border-b shrink-0 min-h-[48px] flex flex-col justify-center py-2">
          {/* Строка 1: статус/иконка + название + действия */}
          <div ref={headerRowRef} className="flex items-center gap-2 px-4">
            {canGoBack && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Назад"
                aria-label="Назад"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}

            {/* Слева всегда индикатор статуса — унификация шапки для всех типов тредов. */}
            <StatusDropdown
              currentStatus={isTask ? statuses.find((s) => s.id === task.status_id) ?? null : null}
              statuses={isTask ? statuses : []}
              onStatusChange={isTask && onStatusChange ? onStatusChange : () => {}}
              size="md"
              disabled={!isTask || !onStatusChange}
            />

            {editingName ? (
              <form
                className="flex items-center gap-1 min-w-0 flex-1"
                onSubmit={(e) => {
                  e.preventDefault()
                  commitEditName()
                }}
              >
                <input
                  ref={editNameRef}
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onBlur={commitEditName}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setEditingName(false)
                  }}
                  className="flex-1 min-w-0 text-base font-semibold bg-transparent border-b-2 border-primary outline-none py-0"
                />
                <button
                  type="submit"
                  className="shrink-0 p-0.5 text-muted-foreground hover:text-foreground"
                >
                  <Check className="w-4 h-4" />
                </button>
              </form>
            ) : (
              <h2
                ref={titleRef}
                className="text-base font-semibold leading-tight truncate min-w-0 cursor-pointer hover:text-primary transition-colors"
                onClick={startEditName}
              >
                {task.name}
              </h2>
            )}

            {/* Иконка треда из настроек — только у чатов/email. */}
            {!isTask && (
              <span className="shrink-0 -ml-0.5">
                {createElement(ThreadIcon, {
                  className: cn('w-4 h-4', COLOR_TEXT[task.accent_color] ?? 'text-blue-500'),
                })}
              </span>
            )}

            {/* Исполнители — только для задач */}
            {isTask && (
              <div className="shrink-0">
                <AssigneesPopover
                  threadId={task.id}
                  projectId={task.project_id}
                  workspaceId={workspaceId}
                  assignees={members}
                />
              </div>
            )}

            <div ref={toolbarRef} className="flex items-center gap-1 ml-auto shrink-0" />

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Настройки"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              title="Закрыть"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Строка 2: «Другие задачи» + проект + дедлайн. */}
          {(task.project_id || (isTask && onDeadlineSet)) && (
            <div
              className="flex items-center gap-2 pr-4 mt-0.5"
              style={{ paddingLeft: `${titleOffset}px` }}
            >
              {/* Другие задачи — переключить панель в Mode 2 (список задач проекта).
                  Текущая задача уходит в стек ниже, возврат — кнопкой «назад». */}
              {task.project_id && onOpenProjectInStack && (
                <button
                  type="button"
                  onClick={() =>
                    onOpenProjectInStack({
                      id: task.project_id!,
                      name: resolvedProjectName ?? 'Проект',
                    })
                  }
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] -ml-1.5 rounded text-xs font-medium transition-colors',
                    'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                  title="Другие задачи"
                  aria-label="Другие задачи"
                >
                  <ListTree className="w-3 h-3" />
                  <span>Другие задачи</span>
                </button>
              )}

              {/* Ссылка на проект */}
              {task.project_id && resolvedProjectName && (
                <a
                  href={`/workspaces/${workspaceId}/projects/${task.project_id}`}
                  onClick={(e) => {
                    if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                      onProjectClick?.()
                      router.push(`/workspaces/${workspaceId}/projects/${task.project_id}`)
                    }
                  }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                  title="Открыть проект"
                >
                  <span className="truncate max-w-[200px]">{resolvedProjectName}</span>
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
              )}

              {/* Дедлайн — только для задач */}
              {isTask && onDeadlineSet && onDeadlineClear && (
                <DeadlinePopover
                  deadline={task.deadline}
                  onSet={onDeadlineSet}
                  onClear={onDeadlineClear}
                  isPending={deadlinePending}
                />
              )}
            </div>
          )}

          {/* Строка 3: email получатели (только для email-тредов) */}
          {isEmail && (
            <div className="flex items-center gap-2 px-4 -mt-1">
              <div className="w-[26px] shrink-0" />
              {task.contact_emails && task.contact_emails.length > 0 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Mail className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[300px]">
                    {task.contact_emails.join(', ')}
                  </span>
                </div>
              )}
              {task.email_subject && (
                <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={task.email_subject}>
                  — {task.email_subject}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Контент — мессенджер треда */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <MessengerTabContent
            projectId={task.project_id ?? undefined}
            workspaceId={workspaceId}
            threadId={task.id}
            accent={task.accent_color as never}
            toolbarPortalContainer={toolbarContainer}
          />
        </div>
      </div>

      {/* Настройки — открываем только когда полный ProjectThread загружен. */}
      {settingsOpen && fullThread && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={fullThread}
            workspaceId={workspaceId}
            projectId={fullThread.project_id ?? undefined}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onUpdate={(params) => {
              onSettingsSave(params)
              setSettingsOpen(false)
            }}
            isPending={settingsPending}
          />
        </Suspense>
      )}
    </>
  )

  const portalRoot = document.getElementById('workspace-panel-root')
  if (!portalRoot) return panel
  return createPortal(panel, portalRoot)
}
