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
import { Pencil, Check, Settings, ExternalLink, X, Mail } from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/EditChatDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'

const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

import { StatusDropdown, type StatusOption } from '@/components/ui/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { cn } from '@/lib/utils'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
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
  showProjectLink,
  onProjectClick,
}: TaskPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])

  // Inline-редактирование названия
  const [editingName, setEditingName] = useState(false)
  const [editNameValue, setEditNameValue] = useState('')
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  const editNameRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Анимация
  const [visible, setVisible] = useState(false)

  const isTask = task?.type === 'task'
  const isEmail = !isTask && (task?.contact_emails?.length ?? 0) > 0

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setVisible(true))
      document.body.setAttribute('data-task-panel-open', '')
    } else {
      setVisible(false)
      document.body.removeAttribute('data-task-panel-open')
    }
    return () => document.body.removeAttribute('data-task-panel-open')
  }, [open])

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

  // Закрытие по клику вне панели
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      // Don't close if click is inside the panel
      if (panelRef.current && panelRef.current.contains(target)) return
      // Don't close if click is inside a Radix portal (popover, dropdown, dialog)
      if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[role="dialog"]')) return
      // Don't close if click is on a file input overlay
      if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'file') return
      onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

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

  // Сброс editing при смене задачи
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setEditingName(false)
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
                className="text-base font-semibold truncate min-w-0 cursor-pointer hover:text-primary transition-colors group/title"
                onClick={startEditName}
              >
                {task.name}
                <Pencil className="w-3 h-3 ml-1.5 inline-block opacity-0 group-hover/title:opacity-50 transition-opacity" />
              </h2>
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

            {/* Проект + Дедлайн — в той же строке */}
            {showProjectLink && task.project_name && (
              <button
                type="button"
                onClick={onProjectClick}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors shrink-0"
                title="Открыть проект"
              >
                <span className="truncate max-w-[120px]">{task.project_name}</span>
                <ExternalLink className="h-3 w-3 opacity-50" />
              </button>
            )}

            {isTask && onDeadlineSet && onDeadlineClear && (
              <DeadlinePopover
                deadline={task.deadline}
                onSet={onDeadlineSet}
                onClear={onDeadlineClear}
                isPending={deadlinePending}
              />
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

          {/* Строка 2: email получатели (только для email-тредов) */}
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
        <div className="flex-1 min-h-0 overflow-hidden">
          <MessengerTabContent
            projectId={task.project_id ?? undefined}
            workspaceId={workspaceId}
            threadId={task.id}
            accent={task.accent_color as never}
            toolbarPortalContainer={toolbarContainer}
          />
        </div>
      </div>

      {/* Настройки */}
      {settingsOpen && (
        <Suspense fallback={null}>
          <ChatSettingsDialog
            chat={task as never}
            workspaceId={workspaceId}
            projectId={task?.project_id ?? undefined}
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
