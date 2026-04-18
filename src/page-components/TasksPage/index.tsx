"use client"

/**
 * Страница «Все задачи» — тонкая обёртка над TaskListView.
 */

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { TaskListView } from '@/components/tasks/TaskListView'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function TasksPage() {
  usePageTitle('Задачи')
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const closePanel = useSidePanelStore((s) => s.closePanel)

  useEffect(() => {
    closePanel()
  }, [closePanel])

  if (!workspaceId) return null

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-auto bg-white">
        <div className="max-w-[789px] px-6 py-6">
          <h1 className="text-xl font-semibold mb-4">Задачи</h1>
          <TaskListView workspaceId={workspaceId} />
        </div>
      </div>
    </WorkspaceLayout>
  )
}
