/**
 * FinanceTabContent — содержимое вкладки «Финансы» проекта.
 * Этап 4: пока только секция «Услуги проекта». Доходы/расходы/сводка
 * добавляются на этапах 5-6.
 */

import { ProjectServicesSection } from './ProjectServicesSection'

interface Props {
  projectId: string
  workspaceId: string
}

export function FinanceTabContent({ projectId, workspaceId }: Props) {
  return (
    <div className="space-y-4">
      <ProjectServicesSection projectId={projectId} workspaceId={workspaceId} />
    </div>
  )
}
