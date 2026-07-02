"use client"

/**
 * Шапка TaskPanel в режиме 1 (тред).
 * Три строки: статус/имя/действия, мета-строка, email-получатели.
 */

import { useState, createElement } from 'react'
import { useRouter } from 'next/navigation'
import {
  ExternalLink, X, ListTree, History, FolderOpen, ChevronDown, Bell, BellOff,
} from 'lucide-react'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { ChatIconColorGrid } from '@/components/messenger/ChatSettingsIconColorPicker'
import { ChatSettingsProjectSelector } from '@/components/messenger/ChatSettingsProjectSelector'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import { useMoveThreadToProject } from '@/hooks/messenger/useMoveThreadToProject'
import { useThreadSubscription } from '@/hooks/messenger/useThreadSubscription'
import { toast } from 'sonner'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useUpdateThread } from '@/hooks/messenger/useProjectThreads'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import { StatusDropdown, type StatusOption } from '@/components/common/status-dropdown'
import { type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { cn } from '@/lib/utils'
import { DeadlinePopover } from './DeadlinePopover'
import { AssigneesPopover } from './AssigneesPopover'
import { TaskActionsMenu } from './TaskActionsMenu'
import { RecurringRuleDialog } from '@/components/recurring/RecurringRuleDialog'
import type { ProjectHeaderInfo, TaskItem } from './types'

type TaskPanelTaskHeaderProps = {
  task: TaskItem
  workspaceId: string
  statuses: StatusOption[]
  members: AvatarParticipant[]
  onStatusChange?: (statusId: string | null) => void
  onDeadlineSet?: (date: Date) => void
  onDeadlineClear?: () => void
  onTimeChange?: (v: import('./TaskTimePickerPopover').TaskTimeValue) => void
  deadlinePending: boolean
  onRename: (name: string) => void
  onSettingsOpen: () => void
  onClose: () => void
  /** Скрыть X-крестик в шапке (когда панель управляется системой вкладок). */
  hideCloseButton?: boolean
  /** Скрыть строку 2 (Другие задачи / История / Документы) — она дублирует системные вкладки. */
  hideToolsRow?: boolean
  onProjectClick?: () => void
  onOpenProjectInStack?: (project: ProjectHeaderInfo) => void
  resolvedProjectName: string | null
  toolbarRef: (node: HTMLDivElement | null) => void
  /** Слот для индикатора канала на мобиле (в выдвижной панели действий). */
  channelToolbarRef?: (node: HTMLDivElement | null) => void
  /** Текущий режим контента панели: тред или «Вся история» проекта */
  viewMode?: 'thread' | 'history' | 'documents'
  /** Переключатель «История» — undefined прячет кнопку (например, у треда без проекта) */
  onToggleHistory?: () => void
  /** Переключатель «Документы» — undefined прячет кнопку (у треда без проекта) */
  onToggleDocuments?: () => void
  /** Удалить тред (мягко в корзину). Пункт в меню «⋮» рядом с дедлайном. */
  onRequestDelete?: () => void
}

export function TaskPanelTaskHeader({
  task,
  workspaceId,
  statuses,
  members,
  onStatusChange,
  onDeadlineSet,
  onDeadlineClear,
  onTimeChange,
  deadlinePending,
  onSettingsOpen,
  onClose,
  hideCloseButton = false,
  hideToolsRow = false,
  onProjectClick,
  onOpenProjectInStack,
  resolvedProjectName,
  toolbarRef,
  channelToolbarRef,
  viewMode = 'thread',
  onToggleHistory,
  onToggleDocuments,
  onRequestDelete,
}: TaskPanelTaskHeaderProps) {
  const router = useRouter()
  const isTask = task.type === 'task'
  const ThreadIcon = getChatIconComponent(task.icon)
  const updateThread = useUpdateThread()

  // Привязка треда к проекту прямо из шапки — кнопка видна только пока проект
  // НЕ выбран. После выбора тред переносится (move_thread_to_project: тред +
  // сообщения) и кнопка прячется. Локальный attachedProjectId, чтобы спрятать
  // кнопку сразу, не дожидаясь обновления пропа task.
  const { data: workspaceProjects = [] } = useWorkspaceProjects(workspaceId)
  const moveThreadToProject = useMoveThreadToProject(workspaceId)
  const [attachedProjectId, setAttachedProjectId] = useState<string | null>(task.project_id ?? null)

  // Подписка на уведомления по треду: колокольчик-индикатор в правом кластере
  // шапки + дублирующий пункт в меню «⋮».
  const subscription = useThreadSubscription(task.id, workspaceId)

  // Диалог «Сделать повторяющейся» (только для задач).
  const [recurringOpen, setRecurringOpen] = useState(false)

  const handleSelectProject = (projectId: string | null) => {
    if (!projectId || projectId === attachedProjectId) return
    setAttachedProjectId(projectId)
    moveThreadToProject.mutate(
      { threadId: task.id, projectId },
      {
        onSuccess: () => {
          const name = workspaceProjects.find((p) => p.id === projectId)?.name ?? 'проект'
          toast.success(`Диалог добавлен в «${name}»`, {
            action: {
              label: 'Отменить',
              onClick: () => {
                setAttachedProjectId(null)
                moveThreadToProject.mutate({ threadId: task.id, projectId: null })
              },
            },
          })
        },
        onError: () => setAttachedProjectId(null),
      },
    )
  }

  // Мобила: выдвижная панель действий (исполнители/срок/проект/поиск/⋮) —
  // на узком экране они давят название, поэтому прячем в раскрывающийся ряд.
  const [actionsOpen, setActionsOpen] = useState(false)

  const [prevTaskId, setPrevTaskId] = useState(task.id)
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id)
    setAttachedProjectId(task.project_id ?? null)
  }

  return (
    <div className={cn('group/panel-header relative border-b shrink-0 flex flex-col', hideToolsRow ? 'h-10' : 'h-[65px]')}>
      {/* Строка 1: статус/иконка + название + действия (жёсткая высота 30px,
          в bare-режиме растягивается на всю шапку h-9). */}
      <div className={cn('flex items-center gap-2 px-4 shrink-0', hideToolsRow ? 'h-full' : 'h-[30px]')}>
        {viewMode === 'history' ? (
          <span className="shrink-0 flex items-center justify-center w-6 h-6 text-muted-foreground">
            <History className="w-4 h-4" />
          </span>
        ) : viewMode === 'documents' ? (
          <span className="shrink-0 flex items-center justify-center w-6 h-6 text-muted-foreground">
            <FolderOpen className="w-4 h-4" />
          </span>
        ) : (
          <StatusDropdown
            currentStatus={statuses.find((s) => s.id === task.status_id) ?? null}
            statuses={statuses}
            onStatusChange={onStatusChange ?? (() => {})}
            size="lg"
            disabled={!onStatusChange}
          />
        )}

        {viewMode === 'history' ? (
          <h2
            className="text-sm font-semibold leading-tight truncate min-w-0"
          >
            История
          </h2>
        ) : viewMode === 'documents' ? (
          <h2
            className="text-sm font-semibold leading-tight truncate min-w-0"
          >
            Документы
          </h2>
        ) : (
          <h2
            className="text-sm font-semibold leading-tight truncate min-w-0 cursor-pointer hover:text-primary transition-colors"
            onClick={onSettingsOpen}
            title="Открыть настройки треда"
          >
            {task.name}
          </h2>
        )}

        {viewMode === 'thread' && !isTask && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                title="Изменить иконку и цвет"
                className="shrink-0 flex items-center justify-center w-5 h-5 rounded hover:bg-muted/60 transition-colors"
              >
                {createElement(ThreadIcon, {
                  className: cn('w-4 h-4', COLOR_TEXT[task.accent_color as ThreadAccentColor] ?? 'text-blue-500'),
                })}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[240px] p-3" sideOffset={4}>
              <ChatIconColorGrid
                accentColor={task.accent_color as ThreadAccentColor}
                icon={task.icon}
                onAccentColorChange={(color: ThreadAccentColor) =>
                  updateThread.mutate({
                    threadId: task.id,
                    projectId: task.project_id ?? '',
                    accent_color: color,
                  })
                }
                onIconChange={(icon: string) =>
                  updateThread.mutate({
                    threadId: task.id,
                    projectId: task.project_id ?? '',
                    icon,
                  })
                }
              />
            </PopoverContent>
          </Popover>
        )}

        {/* Проект в строке треда: в bare-режиме скрыт — он показан в верхней
            строке панели (PanelProjectInfoRow). */}
        {!hideToolsRow && task.project_id && resolvedProjectName && (
          <span className="shrink-0 text-muted-foreground/50 select-none" aria-hidden="true">
            •
          </span>
        )}

        {!hideToolsRow && task.project_id && resolvedProjectName && (
          <a
            href={`/workspaces/${workspaceId}/projects/${task.project_id}`}
            onClick={(e) => {
              if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
                e.preventDefault()
                onProjectClick?.()
                router.push(`/workspaces/${workspaceId}/projects/${task.project_id}`)
              }
            }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors shrink-0 min-w-0"
            title="Открыть проект"
          >
            <span className="truncate max-w-[200px]">{resolvedProjectName}</span>
            <ExternalLink className="h-3 w-3 opacity-50 shrink-0" />
          </a>
        )}

        {/* Группа действий. Десктоп: `md:contents` — обёртка растворяется,
            действия inline в строке шапки как раньше. Мобила: выдвижная панель
            под шапкой (абсолютная, поверх ленты), скрыта пока не открыта
            шевроном — чтобы не давить название треда. */}
        <div
          className={cn(
            'items-center gap-2',
            'absolute top-full inset-x-0 z-20 bg-background border-b px-4 py-2 shadow-md',
            actionsOpen ? 'flex' : 'hidden',
            'md:contents',
          )}
        >
        <div className="shrink-0">
          <AssigneesPopover
            threadId={task.id}
            projectId={task.project_id}
            workspaceId={workspaceId}
            assignees={members}
          />
        </div>

        {onDeadlineSet && onDeadlineClear && (
          <DeadlinePopover
            deadline={task.deadline}
            startAt={task.start_at}
            endAt={task.end_at}
            onChange={onTimeChange}
            onSet={onDeadlineSet}
            onClear={onDeadlineClear}
            isPending={deadlinePending}
            placeholderLabelClassName=""
          />
        )}

        {/* Привязать тред к проекту — только пока проект не выбран. Стиль 1:1
            с чипом «Срок» (DeadlinePopover): цвет, размер шрифта, паддинги. */}
        {!attachedProjectId && (
          <ChatSettingsProjectSelector
            workspaceProjects={workspaceProjects}
            selectedProjectId={null}
            isEditMode
            onSelect={handleSelectProject}
            createDefaultName={task.name}
            workspaceId={workspaceId}
            label="Проект"
            iconClassName="w-3 h-3"
            triggerClassName="flex items-center gap-1 text-xs rounded px-1.5 py-0.5 transition-colors shrink-0 whitespace-nowrap text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50"
          />
        )}

        {isTask && (
          <RecurringRuleDialog
            open={recurringOpen}
            onClose={() => setRecurringOpen(false)}
            workspaceId={workspaceId}
            prefill={{
              title: task.name,
              projectId: task.project_id ?? null,
              projectName: resolvedProjectName,
              statusId: task.status_id,
              accentColor: task.accent_color,
              icon: task.icon,
              assigneeIds: members.map((m) => m.id),
            }}
          />
        )}
        {/* Колокольчик уведомлений в выдвижной панели — ТОЛЬКО мобила (на десктопе
            он inline в правом кластере). Только иконка, прижата вправо (ml-auto). */}
        {viewMode === 'thread' && subscription.isSubscribed !== null && (
          <button
            type="button"
            disabled={subscription.pending}
            onClick={() => subscription.setSubscribed(!subscription.isSubscribed)}
            title={subscription.isSubscribed ? 'Уведомления включены — выключить' : 'Уведомления выключены — включить'}
            aria-label="Уведомления по треду"
            className={cn(
              'md:hidden ml-auto inline-flex items-center justify-center shrink-0 p-1 rounded-md transition-colors disabled:opacity-50',
              subscription.isSubscribed
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                : 'text-amber-600 hover:bg-amber-50',
            )}
          >
            {subscription.isSubscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        )}

        {/* Слот индикатора канала — заполняется порталом ChatToolbar (только
            мобила). ml-auto НЕ ставим: вправо толкает колокольчик выше, канал
            идёт сразу за ним. На десктопе скрыт (канал inline рядом с поиском). */}
        <div ref={channelToolbarRef} className="md:hidden flex items-center shrink-0" />
        </div>

        {/* Зазор + вертикальный разделитель перед правым кластером иконок
            (поиск/email/⋮), отделяет их от чипов слева. Разделитель несёт
            ml-auto (отталкивает вправо). На мобиле скрыт — там тесно, и ml-auto
            берёт сам тулбар. */}
        <div aria-hidden className="hidden md:block ml-auto w-px h-5 bg-border shrink-0" />

        {/* Поиск (ChatToolbar) — остаётся на верхнем ряду. */}
        <div ref={toolbarRef} className="flex items-center gap-1 ml-auto md:ml-0 shrink-0" />

        {/* Колокольчик = тумблер уведомлений по треду. На ДЕСКТОПЕ — inline в
            правом кластере. На мобиле скрыт здесь и продублирован в выдвижной
            панели действий (ниже), чтобы не теснить шапку. */}
        {viewMode === 'thread' && subscription.isSubscribed !== null && (
          <button
            type="button"
            disabled={subscription.pending}
            onClick={() => subscription.setSubscribed(!subscription.isSubscribed)}
            title={subscription.isSubscribed ? 'Уведомления включены — выключить' : 'Уведомления выключены — включить'}
            aria-label="Уведомления по треду"
            className={cn(
              'hidden md:inline-flex items-center justify-center shrink-0 p-1 rounded-md transition-colors disabled:opacity-50',
              subscription.isSubscribed
                ? 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                : 'text-amber-600 hover:bg-amber-50',
            )}
          >
            {subscription.isSubscribed ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          </button>
        )}

        {/* Меню «⋮» — те же действия, что и в строке задачи, кроме «Открыть»
            (тред уже открыт в этой панели). */}
        {viewMode === 'thread' && (
          <TaskActionsMenu
            statuses={statuses}
            currentStatusId={task.status_id}
            onStatusChange={onStatusChange}
            deadline={task.deadline}
            onDeadlineSet={onDeadlineSet}
            onDeadlineClear={onDeadlineClear}
            deadlinePending={deadlinePending}
            onOpenSettings={onSettingsOpen}
            onMakeRecurring={isTask ? () => setRecurringOpen(true) : undefined}
            isSubscribed={subscription.isSubscribed}
            onToggleSubscribe={subscription.setSubscribed}
            subscribePending={subscription.pending}
            onRequestDelete={onRequestDelete}
            triggerClassName="opacity-100"
            align="end"
          />
        )}

        {/* Шеврон — раскрывает панель действий (только мобила). */}
        <button
          type="button"
          onClick={() => setActionsOpen((o) => !o)}
          aria-label="Действия с тредом"
          className="md:hidden shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <ChevronDown className={cn('w-4 h-4 transition-transform', actionsOpen && 'rotate-180')} />
        </button>

        {!hideCloseButton && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Закрыть"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Строка 2: «Другие задачи» + «История» + «Документы».
          В bare-режиме (когда панель управляется системой вкладок TaskPanelTabbedShell)
          скрыта, потому что эти действия дублируют системные вкладки [+] меню. */}
      {!hideToolsRow && (
      <div className="flex items-start gap-2 pr-4 pl-[48px] h-[26px] shrink-0">
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

          {onToggleHistory && (
            <button
              type="button"
              onClick={onToggleHistory}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-xs font-medium transition-colors',
                viewMode === 'history'
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              title={viewMode === 'history' ? 'Вернуться к треду' : 'Вся история проекта'}
              aria-pressed={viewMode === 'history'}
            >
              <History className="w-3 h-3" />
              <span>История</span>
            </button>
          )}

          {onToggleDocuments && (
            <button
              type="button"
              onClick={onToggleDocuments}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-1.5 py-[3px] rounded text-xs font-medium transition-colors',
                viewMode === 'documents'
                  ? 'bg-amber-50 text-amber-700'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
              title={viewMode === 'documents' ? 'Вернуться к треду' : 'Документы проекта'}
              aria-pressed={viewMode === 'documents'}
            >
              <FolderOpen className="w-3 h-3" />
              <span>Документы</span>
            </button>
          )}

      </div>
      )}
    </div>
  )
}
