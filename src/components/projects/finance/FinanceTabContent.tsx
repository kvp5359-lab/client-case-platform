/**
 * FinanceTabContent — содержимое вкладки «Финансы» проекта.
 *
 * Структура (сверху вниз):
 *   1. Карточки сводки (стоимость, доходы, расходы, прибыль, % оплаты)
 *   2. Услуги проекта (с DnD-сортировкой)
 *   3. Доходы
 *   4. Расходы
 */

import { FinanceSummary } from './FinanceSummary'
import { ProjectServicesSection } from './ProjectServicesSection'
import { ProjectTransactionsSection } from './ProjectTransactionsSection'

interface Props {
  projectId: string
  workspaceId: string
}

export function FinanceTabContent({ projectId, workspaceId }: Props) {
  return (
    <div className="space-y-8">
      <FinanceSummary projectId={projectId} />
      <ProjectServicesSection projectId={projectId} workspaceId={workspaceId} />
      <ProjectTransactionsSection projectId={projectId} workspaceId={workspaceId} type="income" />
      <ProjectTransactionsSection projectId={projectId} workspaceId={workspaceId} type="expense" />
    </div>
  )
}
