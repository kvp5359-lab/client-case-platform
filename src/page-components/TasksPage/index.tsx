"use client"

/**
 * Страница «Все задачи» — тонкая обёртка над TaskListView.
 *
 * URL `?filter=no_project` включает фильтр «Без проекта» — показывает только
 * треды без project_id (личные диалоги + orphan-задачи смешано). Используется
 * как целевая страница для виртуальной записи «Без проекта» в сайдбаре.
 */

import { useEffect, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { TaskListView } from '@/components/tasks/TaskListView'
import { NO_PROJECT_ID } from '@/components/tasks/useTaskFilters'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function TasksPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const searchParams = useSearchParams()
  const isNoProject = searchParams?.get('filter') === 'no_project'
  usePageTitle(isNoProject ? 'Без проекта' : 'Задачи')
  const closePanel = useSidePanelStore((s) => s.closePanel)

  useEffect(() => {
    closePanel()
  }, [closePanel])

  // Передаём initial filter в TaskListView один раз при монтировании страницы
  // с включённым фильтром. memo-обёртка стабилизирует Set по ссылке.
  const initialProjectFilterIds = useMemo(
    () => (isNoProject ? new Set([NO_PROJECT_ID]) : undefined),
    [isNoProject],
  )

  if (!workspaceId) return null

  return (
    <WorkspaceLayout>
      <div className="h-full overflow-auto bg-white">
        <div className="max-w-[789px] px-6 py-6">
          <h1 className="text-xl font-semibold mb-4">{isNoProject ? 'Без проекта' : 'Задачи'}</h1>
          <TaskListView
            workspaceId={workspaceId}
            initialProjectFilterIds={initialProjectFilterIds}
            // Для «Без проекта» пресет 'all' — иначе фильтр my_active отсечёт
            // задачи где я не исполнитель/постановщик, что нелогично для этого
            // вида (мы и так уже сузили выборку по project_id).
            initialPreset={isNoProject ? 'all' : undefined}
          />
        </div>
      </div>
    </WorkspaceLayout>
  )
}
