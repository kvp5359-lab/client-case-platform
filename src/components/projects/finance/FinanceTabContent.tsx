/**
 * FinanceTabContent — содержимое вкладки «Финансы» проекта.
 *
 * Раскладка:
 *   1. Карточки сводки (стоимость, доходы, расходы, прибыль, % оплаты)
 *   2. Когда контенту хватает ширины (container query `finance-tab`,
 *      см. globals.css) — две колонки: слева «Услуги проекта», справа
 *      «Доходы» над «Расходами». На узких — всё в одну колонку.
 */

import { useEffect } from 'react'
import { FinanceSummary } from './FinanceSummary'
import { ProjectServicesSection } from './ProjectServicesSection'
import { ProjectTransactionsSection } from './ProjectTransactionsSection'

type Props = {
  projectId: string
  workspaceId: string
}

export function FinanceTabContent({ projectId, workspaceId }: Props) {
  // Push-режим правой панели: на вкладке финансов открытая панель отжимает
  // контент влево, а не накладывается поверх (тот же паттерн, что в
  // TaskListView и DocumentsTabContent — атрибут читает CSS в globals.css).
  // Контент сужается → container query `finance-tab` сам складывает
  // двухколоночную сетку в одну колонку.
  useEffect(() => {
    document.body.setAttribute('data-panel-mode', 'push')
    return () => document.body.removeAttribute('data-panel-mode')
  }, [])

  return (
    <div className="space-y-8 finance-cq">
      <FinanceSummary projectId={projectId} />
      <div className="finance-grid grid grid-cols-1 gap-8 items-start">
        <ProjectServicesSection projectId={projectId} workspaceId={workspaceId} />
        <div className="space-y-8">
          <ProjectTransactionsSection
            projectId={projectId}
            workspaceId={workspaceId}
            type="income"
          />
          <ProjectTransactionsSection
            projectId={projectId}
            workspaceId={workspaceId}
            type="expense"
          />
        </div>
      </div>
    </div>
  )
}
