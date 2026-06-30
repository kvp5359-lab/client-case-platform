"use client"

/**
 * TaskPanel — правая боковая панель для просмотра треда или проекта.
 *
 * ── Два режима ──
 * Режим 1 (task): шапка + MessengerTabContent.
 * Режим 2 (project): шапка + TaskListView проекта.
 *
 * Подкомпоненты:
 * - TaskPanelProjectView — режим 2 целиком
 * - TaskPanelTaskHeader — шапка режима 1
 *
 * Серверные запросы, эффекты и derived-значения вынесены в
 * `useTaskPanelInternal`. Здесь — только UI-state и JSX.
 */

import { useState, useCallback, Suspense } from 'react'
import { LazyChatSettingsDialog as ChatSettingsDialog } from '@/components/lazyChatSettingsDialog'
import { createPortal } from 'react-dom'
import { ArrowLeft } from 'lucide-react'
import { MessengerTabContent } from '@/components/messenger/MessengerTabContent'
import type { MessengerAccent } from '@/components/messenger/utils/messageStyles'
import { AllHistoryContent } from '@/components/history/AllHistoryContent'
import { PanelDocumentsContent } from '@/components/documents/PanelDocumentsContent'
import { cn } from '@/lib/utils'
import { TaskPanelProjectView } from './TaskPanelProjectView'
import { TaskPanelTaskHeader } from './TaskPanelTaskHeader'
import { useTaskPanelInternal } from './useTaskPanelInternal'
import type { StatusOption } from '@/components/common/status-dropdown'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { TaskItem, ProjectHeaderInfo, PanelStackItem } from './types'

export type { ProjectHeaderInfo, PanelStackItem } from './types'

export type TaskPanelProps = {
  stackTop: PanelStackItem | null
  open: boolean
  onClose: () => void
  workspaceId: string
  statuses?: StatusOption[]
  members?: AvatarParticipant[]
  onStatusChange?: (statusId: string | null) => void
  onDeadlineSet?: (date: Date) => void
  onDeadlineClear?: () => void
  onTimeChange?: (v: import('./TaskTimePickerPopover').TaskTimeValue) => void
  onRename: (name: string) => void
  onSettingsSave: (params: { name: string; accent_color: string; icon: string; description?: string | null; deadline?: string | null; start_at?: string | null; end_at?: string | null }) => void
  deadlinePending?: boolean
  settingsPending: boolean
  showProjectLink?: boolean
  onProjectClick?: () => void
  onBack?: () => void
  canGoBack?: boolean
  onOpenThreadInStack?: (task: TaskItem) => void
  onOpenProjectInStack?: (project: ProjectHeaderInfo) => void
  /** Удалить тред (мягко в корзину) — пункт в меню «⋮» в шапке. */
  onRequestDelete?: () => void
  /** Слот, который рендерится сверху панели (над шапкой). Используется для системы вкладок. */
  topSlot?: React.ReactNode
  /**
   * Bare-режим: не оборачивать в .side-panel, не портить, не анимировать въезд.
   * Когда true — TaskPanel рендерит только содержимое (шапка + body), а внешний
   * контейнер с анимацией предоставляет родитель (например, TaskPanelTabbedShell).
   * Это нужно для системы вкладок: при переключении вкладок панель не должна
   * перевыезжать.
   */
  bare?: boolean
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
  onTimeChange,
  onRename,
  onSettingsSave,
  deadlinePending = false,
  settingsPending,
  onProjectClick,
  onBack,
  canGoBack = false,
  onOpenThreadInStack,
  onOpenProjectInStack,
  onRequestDelete,
  topSlot,
  bare = false,
}: TaskPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [toolbarContainer, setToolbarContainer] = useState<HTMLDivElement | null>(null)
  const toolbarRef = useCallback((node: HTMLDivElement | null) => setToolbarContainer(node), [])
  // Второй контейнер — индикатор канала на мобиле (выдвижная панель шапки).
  const [channelContainer, setChannelContainer] = useState<HTMLDivElement | null>(null)
  const channelToolbarRef = useCallback((node: HTMLDivElement | null) => setChannelContainer(node), [])
  const [viewMode, setViewMode] = useState<'thread' | 'history' | 'documents'>('thread')

  const {
    user,
    task,
    mode,
    projectItem,
    projectThreads,
    resolvedProjectName,
    threadLastReadAt,
    fullThread,
    liveTask,
    visible,
  } = useTaskPanelInternal({
    stackTop,
    open,
    bare,
    viewMode,
    settingsOpen,
    onClose,
    onOpenThreadInStack,
  })

  // Сброс режима просмотра при смене треда в стеке
  const [prevTaskId, setPrevTaskId] = useState(task?.id)
  if (task?.id !== prevTaskId) {
    setPrevTaskId(task?.id)
    setViewMode('thread')
  }

  if (!open || !stackTop) return null

  // ── Режим 2: проект ──
  if (mode === 'project' && projectItem) {
    const panel = (
      <TaskPanelProjectView
        project={projectItem}
        workspaceId={workspaceId}
        visible={visible}
        canGoBack={canGoBack}
        onBack={onBack}
        onClose={onClose}
        onOpenThreadInStack={onOpenThreadInStack}
        topSlot={topSlot}
        bare={bare}
      />
    )
    if (bare) return panel
    const portalRoot = document.getElementById('workspace-panel-root')
    return portalRoot ? createPortal(panel, portalRoot) : panel
  }

  // ── Режим 1: тред ──
  if (!task || !liveTask) return null

  // Единая точка «шаг назад»: из history/documents — обратно к треду, иначе — по стеку.
  const backAction =
    viewMode === 'history'
      ? () => setViewMode('thread')
      : viewMode === 'documents'
        ? () => setViewMode('thread')
        : canGoBack
          ? onBack
          : undefined

  const innerContent = (
    <>
        {/* Плавающая круглая кнопка «Назад» — сидит на левой границе панели,
            не смещает содержимое шапки. Появляется и в стек-навигации
            (canGoBack), и при переключении viewMode на history/documents. */}
        {backAction && (
          <button
            type="button"
            onClick={backAction}
            className="absolute left-0 top-1 -translate-x-[60%] z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors"
            title={viewMode === 'thread' ? 'Назад' : 'Назад к треду'}
            aria-label="Назад"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}

        {topSlot}

        <TaskPanelTaskHeader
          task={liveTask}
          workspaceId={workspaceId}
          statuses={statuses}
          members={members}
          onStatusChange={onStatusChange}
          onDeadlineSet={onDeadlineSet}
          onDeadlineClear={onDeadlineClear}
          onTimeChange={onTimeChange}
          deadlinePending={deadlinePending}
          onRename={onRename}
          onSettingsOpen={() => setSettingsOpen(true)}
          onClose={onClose}
          hideCloseButton={bare}
          hideToolsRow={bare}
          onProjectClick={onProjectClick}
          onOpenProjectInStack={onOpenProjectInStack}
          resolvedProjectName={resolvedProjectName}
          toolbarRef={toolbarRef}
          channelToolbarRef={channelToolbarRef}
          viewMode={viewMode}
          onToggleHistory={
            task.project_id
              ? () => setViewMode((m) => (m === 'history' ? 'thread' : 'history'))
              : undefined
          }
          onToggleDocuments={
            task.project_id
              ? () => setViewMode((m) => (m === 'documents' ? 'thread' : 'documents'))
              : undefined
          }
          onRequestDelete={onRequestDelete}
        />

        <div className="flex-1 min-h-0 overflow-hidden relative flex flex-col">
          {viewMode === 'documents' && task.project_id ? (
            <PanelDocumentsContent
              projectId={task.project_id}
              workspaceId={workspaceId}
            />
          ) : viewMode === 'history' && task.project_id ? (
            <AllHistoryContent
              projectId={task.project_id}
              workspaceId={workspaceId}
              threads={projectThreads}
              currentUserId={user?.id}
              threadLastReadAt={threadLastReadAt}
              onOpenChat={(threadId) => {
                // Клик по тому же треду, что сейчас в стеке — просто закрываем историю.
                if (threadId === task.id) {
                  setViewMode('thread')
                  return
                }
                const t = projectThreads.find((x) => x.id === threadId)
                if (!t || !onOpenThreadInStack) {
                  setViewMode('thread')
                  return
                }
                // Пушим новый тред поверх стека. viewMode сбросится автоматически
                // через эффект смены task.id.
                onOpenThreadInStack({
                  id: t.id,
                  name: t.name,
                  type: t.type,
                  project_id: t.project_id,
                  workspace_id: t.workspace_id,
                  status_id: t.status_id,
                  deadline: t.deadline,
                  accent_color: t.accent_color,
                  icon: t.icon,
                  is_pinned: t.is_pinned,
                  created_at: t.created_at,
                  sort_order: t.sort_order,
                })
              }}
            />
          ) : (
            <MessengerTabContent
              projectId={task.project_id ?? undefined}
              workspaceId={workspaceId}
              threadId={task.id}
              accent={liveTask.accent_color as MessengerAccent}
              toolbarPortalContainer={toolbarContainer}
              channelPortalContainer={channelContainer}
            />
          )}
        </div>
    </>
  )

  const settingsDialog = settingsOpen && fullThread ? (
    <Suspense fallback={null}>
      <ChatSettingsDialog
        chat={fullThread}
        workspaceId={workspaceId}
        projectId={fullThread.project_id ?? undefined}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onUpdate={(params) => { onSettingsSave(params); setSettingsOpen(false) }}
        isPending={settingsPending}
      />
    </Suspense>
  ) : null

  // Bare-режим: возвращаем содержимое без обёртки .side-panel и без портала.
  // Анимацию и портал предоставляет родитель (TaskPanelTabbedShell).
  if (bare) {
    return (
      <div className="flex flex-col h-full min-w-0 relative">
        {innerContent}
        {settingsDialog}
      </div>
    )
  }

  const panel = (
    <>
      <div
        className={cn(
          'side-panel flex flex-col z-50',
          'transition-transform duration-200 ease-out',
          visible ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {innerContent}
      </div>
      {settingsDialog}
    </>
  )

  const portalRoot = document.getElementById('workspace-panel-root')
  return portalRoot ? createPortal(panel, portalRoot) : panel
}
