"use client"

/**
 * PanelStandaloneInfoRow — верхняя строка боковой панели для standalone-тредов
 * (тред без project_id и без contact_participant_id: личные диалоги TG Business /
 * MTProto / Wazzup личный, или просто внутренний тред без контекста).
 *
 * Показывает имя треда (обычно — имя собеседника), кнопку выбора/создания проекта
 * (привязать диалог к сделке-проекту прямо отсюда, не открывая настройки) и «×».
 * × живёт здесь, а не во вкладочной строке, чтобы кнопка закрытия была
 * всегда доступна в standalone-режиме (TabBar не рендерится).
 */

import { useState } from 'react'
import { X, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'
import { ChatSettingsProjectSelector } from '@/components/messenger/ChatSettingsProjectSelector'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import { useMoveThreadToProject } from '@/hooks/messenger/useMoveThreadToProject'
import type { TaskItem } from './types'

type PanelStandaloneInfoRowProps = {
  thread: TaskItem
  workspaceId: string
  onHidePanel: () => void
}

export function PanelStandaloneInfoRow({
  thread,
  workspaceId,
  onHidePanel,
}: PanelStandaloneInfoRowProps) {
  const { data: workspaceProjects = [] } = useWorkspaceProjects(workspaceId)
  const moveMutation = useMoveThreadToProject(workspaceId)
  // Локально отражаем привязку, чтобы чип сразу показал имя проекта без
  // переоткрытия треда. Панель остаётся в standalone-режиме — содержимое чата
  // рендерится по threadId независимо от scope; полный контекст проекта
  // подхватится при следующем открытии треда из инбокса/доски.
  const [attachedProjectId, setAttachedProjectId] = useState<string | null>(
    thread.project_id ?? null,
  )

  const applyMove = (projectId: string | null) => {
    const prev = attachedProjectId
    if (projectId === prev) return
    setAttachedProjectId(projectId)
    moveMutation.mutate(
      { threadId: thread.id, projectId },
      {
        onSuccess: () => {
          if (projectId) {
            const name =
              workspaceProjects.find((p) => p.id === projectId)?.name ?? 'проект'
            toast.success(`Диалог добавлен в «${name}»`, {
              action: {
                label: 'Отменить',
                onClick: () => {
                  setAttachedProjectId(prev)
                  moveMutation.mutate({ threadId: thread.id, projectId: prev })
                },
              },
            })
          } else {
            toast.success('Диалог убран из проекта')
          }
        },
        onError: () => setAttachedProjectId(prev),
      },
    )
  }

  return (
    <div className="flex items-center gap-2 px-3 h-9 border-b shrink-0 bg-gray-100/60 text-xs">
      <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="font-medium text-sm truncate min-w-0 shrink">{thread.name}</span>

      <div className="shrink-0">
        <ChatSettingsProjectSelector
          workspaceProjects={workspaceProjects}
          selectedProjectId={attachedProjectId}
          isEditMode
          onSelect={applyMove}
          createDefaultName={thread.name}
          variant="muted"
        />
      </div>

      <div className="flex-1 min-w-0" />

      <button
        type="button"
        onClick={onHidePanel}
        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white border border-gray-200 transition-all duration-150 hover:scale-110 hover:rotate-90 hover:border-gray-300"
        title="Скрыть панель"
        aria-label="Скрыть панель"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}
