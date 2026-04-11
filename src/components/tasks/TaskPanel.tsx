"use client"

/**
 * TaskPanel — правая боковая панель для просмотра треда (задачи, чата, email).
 * Открывается поверх основной правой панели (sidebar) с тем же размером.
 * Адаптирует шапку под тип треда:
 * - Задача: статус, дедлайн, исполнители
 * - Чат: только название + настройки
 * - Email: получатели, тема
 */

import { useState, useCallback, useRef, useEffect, createElement, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Pencil, Check, Settings, ExternalLink, X, Mail, ArrowLeft, ListTree } from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import { TaskPanelContext, useLayoutTaskPanel } from './TaskPanelContext'

// TaskListView импортируется лениво, чтобы избежать циклической зависимости:
// TaskListView → TaskPanel → TaskListView. Нужен только когда пользователь
// открыл встроенный список тредов проекта внутри панели.
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

export interface TaskPanelProps {
  task: TaskItem | null
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
  /** Callback при клике на ссылку проекта */
  onProjectClick?: () => void
  /** Вернуться на один шаг назад по стеку тредов. Если undefined — кнопка скрыта. */
  onBack?: () => void
  /** Есть ли предыдущий тред в стеке (кнопка «назад» активна). */
  canGoBack?: boolean
  /** Положить тред поверх стека — вызывается из встроенного TaskListView. */
  onOpenThreadInStack?: (task: TaskItem) => void
}

export function TaskPanel({
  task,
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
}: TaskPanelProps) {
  const router = useRouter()
  const parentPanelCtx = useLayoutTaskPanel()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])
  /** Встроенный список тредов проекта — показывается поверх MessengerTabContent */
  const [threadListOpen, setThreadListOpen] = useState(false)

  // Inline-редактирование названия
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  const editNameRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Полный ProjectThread подгружаем только когда юзер открывает настройки:
  // TaskItem не содержит access_type / access_roles / legacy_channel и др.
  // полей, без которых ChatSettingsDialog не может восстановить состояние
  // «Кто видит чат» и не подгружает участников.
  const { data: fullThread } = useProjectThreadById(task?.id, settingsOpen)

  // Загрузка project_name:
  // - Если task.project_name уже передан — берём его синхронно (derived).
  // - Иначе запрашиваем из БД в эффекте и кладём в fetchedProjectName.
  // Разделение убирает setState-в-эффекте для синхронной ветки.
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
  const isEmail = !isTask && (task?.contact_emails?.length ?? 0) > 0

  // Закрытие по Escape (Escape с приоритетом: встроенный список тредов → панель)
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsOpen) return
        if (threadListOpen) {
          e.preventDefault()
          setThreadListOpen(false)
          return
        }
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose, settingsOpen, threadListOpen])

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

  const commitEditName = () => {
    const trimmed = editNameValue.trim()
    if (trimmed && task && trimmed !== task.name) {
      onRename(trimmed)
    }
    setEditingName(false)
  }

  // Сброс при смене задачи: inline-редактирование названия и встроенный список тредов.
  // Derived state during render — устраняет cascading-рендер useEffect+setState.
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setEditingName(false)
    setThreadListOpen(false)
  }

  if (!open || !task) return null

  const ThreadIcon = getChatIconComponent(task.icon)

  const panel = (
    <>
      {/* Панель */}
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
          <div className="flex items-center gap-2 px-4">
            {/* Кнопка «назад» — видна только если в стеке тредов больше одного */}
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

            {/* Статус-дропдаун (только задачи) или иконка треда */}
            {isTask && statuses.length > 0 && onStatusChange ? (
              <StatusDropdown
                currentStatus={statuses.find((s) => s.id === task.status_id) ?? null}
                statuses={statuses}
                onStatusChange={onStatusChange}
                size="md"
              />
            ) : (
              <span className="shrink-0">
                {createElement(ThreadIcon, {
                  className: cn('w-4 h-4', COLOR_TEXT[task.accent_color] ?? 'text-blue-500'),
                })}
              </span>
            )}

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
                className="text-base font-semibold leading-tight truncate min-w-0 cursor-pointer hover:text-primary transition-colors group/title"
                onClick={startEditName}
              >
                {task.name}
                <Pencil className="w-3 h-3 ml-1.5 inline-block opacity-0 group-hover/title:opacity-50 transition-opacity" />
              </h2>
            )}

            {/* Исполнители — сразу после названия (только для задач) */}
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

          {/* Строка 2: проект + дедлайн.
              Показываем, если есть проект или (тред — задача и доступен дедлайн). */}
          {(task.project_id || (isTask && onDeadlineSet)) && (
            <div className="flex items-center gap-2 px-4 mt-0.5">
              {/* Отступ под название треда. База: иконка статуса (w-4 = 16px) + gap-2 (8px) = 24px.
                  Если в строке 1 есть кнопка «назад» — плюс её ширина (p-1 + w-4 + p-1 = 24px)
                  и разделитель gap-2 (8px) = ещё 32px. Итого 56px. */}
              <div className={cn('shrink-0', canGoBack && onBack ? 'w-14' : 'w-6')} />

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

              {/* Другие задачи — показать/скрыть встроенный TaskListView */}
              {task.project_id && onOpenThreadInStack && (
                <button
                  type="button"
                  onClick={() => setThreadListOpen((v) => !v)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-xs font-medium transition-colors',
                    threadListOpen
                      ? 'bg-brand-100 text-brand-600'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                  )}
                  title={threadListOpen ? 'Скрыть список тредов' : 'Другие задачи'}
                  aria-label="Другие задачи"
                  aria-pressed={threadListOpen}
                >
                  <ListTree className="w-3 h-3" />
                  <span>Другие задачи</span>
                </button>
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

        {/* Контент — мессенджер */}
        <div className="flex-1 min-h-0 overflow-hidden relative">
          <MessengerTabContent
            projectId={task.project_id ?? undefined}
            workspaceId={workspaceId}
            threadId={task.id}
            accent={task.accent_color as never}
            toolbarPortalContainer={toolbarContainer}
          />

          {/* Встроенный список тредов проекта — оверлей поверх мессенджера.
              Контекст перезаписан так, что клик по треду в списке вызывает
              pushThread, а не внешнее openThread: так работает стек панели. */}
          {threadListOpen && task.project_id && onOpenThreadInStack && (
            <TaskPanelContext.Provider
              value={{
                // Клик по текущему открытому треду — просто закрыть оверлей списка
                // (пользователь возвращается к тому, что уже видел). Клик по другому
                // треду — push в стек.
                openThread: (next) => {
                  if (next.id === task.id) setThreadListOpen(false)
                  else onOpenThreadInStack(next)
                },
                pushThread: (next) => {
                  if (next.id === task.id) setThreadListOpen(false)
                  else onOpenThreadInStack(next)
                },
                closeThread: parentPanelCtx?.closeThread ?? onClose,
                isInsidePanel: true,
              }}
            >
              <div className="absolute inset-0 z-20 bg-background overflow-auto">
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
                      projectId={task.project_id}
                      showProject={false}
                      showProjectLink={false}
                    />
                  </Suspense>
                </div>
              </div>
            </TaskPanelContext.Provider>
          )}
        </div>
      </div>

      {/* Настройки — открываем только когда полный ProjectThread загружен,
          иначе ChatSettingsDialog получит TaskItem-каст без access_type и
          не подгрузит участников / пресет доступа. */}
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
