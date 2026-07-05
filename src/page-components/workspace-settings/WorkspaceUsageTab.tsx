"use client"

/**
 * Вкладка «Использование» — статистика ресурсов + тариф, лимиты и потребление
 * воркспейса. Композит: WorkspaceStatsSection (счётчики) + WorkspaceUsageSection
 * (тариф/лимиты/экспорт, переиспользуется из «Общих»).
 */

import { useParams } from 'next/navigation'
import { WorkspaceStatsSection } from './components/WorkspaceStatsSection'
import { WorkspaceUsageSection } from './components/WorkspaceUsageSection'

export function WorkspaceUsageTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  if (!workspaceId) return null

  return (
    <div className="h-full overflow-auto pr-1">
      <div className="max-w-2xl space-y-8 pb-8">
        <WorkspaceStatsSection workspaceId={workspaceId} />
        <div className="border-t pt-6">
          <WorkspaceUsageSection workspaceId={workspaceId} />
        </div>
      </div>
    </div>
  )
}
