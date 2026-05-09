/**
 * FinanceSummary — карточки сверху на вкладке «Финансы».
 * Считает агрегаты на фронте по уже загруженным данным
 * (project_services + project_transactions).
 */

import { useMemo } from 'react'
import { useProjectServices } from '@/hooks/useProjectServices'
import { useProjectTransactions } from '@/hooks/useProjectTransactions'

const fmt = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  )

interface CardProps {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'positive' | 'negative'
}

function StatCard({ label, value, hint, tone = 'default' }: CardProps) {
  const valueColor =
    tone === 'positive' ? 'text-emerald-700' : tone === 'negative' ? 'text-red-700' : 'text-gray-900'
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${valueColor}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

interface Props {
  projectId: string
}

export function FinanceSummary({ projectId }: Props) {
  const { data: services = [] } = useProjectServices(projectId)
  const { data: incomes = [] } = useProjectTransactions(projectId, 'income')
  const { data: expenses = [] } = useProjectTransactions(projectId, 'expense')

  const stats = useMemo(() => {
    // Стоимость = сумма позиций с учётом налога (subtotal + налог сверху).
    let cost = 0
    for (const s of services) {
      const sub = Number(s.total ?? 0)
      const rate = s.tax_rate == null ? 0 : Number(s.tax_rate)
      cost += sub * (1 + rate / 100)
    }
    const incomeSum = incomes.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
    const expenseSum = expenses.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
    const profit = incomeSum - expenseSum
    const paymentPct = cost > 0 ? (incomeSum / cost) * 100 : null
    return { cost, incomeSum, expenseSum, profit, paymentPct }
  }, [services, incomes, expenses])

  return (
    <div className="grid gap-x-8 gap-y-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Стоимость" value={`${fmt(stats.cost)} EUR`} hint="Услуги проекта с налогом" />
      <StatCard
        label="Доходы"
        value={`${fmt(stats.incomeSum)} EUR`}
        tone="positive"
      />
      <StatCard
        label="Расходы"
        value={`${fmt(stats.expenseSum)} EUR`}
        tone="negative"
      />
      <StatCard
        label="Прибыль"
        value={`${fmt(stats.profit)} EUR`}
        tone={stats.profit >= 0 ? 'positive' : 'negative'}
        hint="Доходы − расходы"
      />
      <StatCard
        label="Оплачено"
        value={stats.paymentPct === null ? '—' : `${stats.paymentPct.toFixed(0)}%`}
        hint={stats.paymentPct === null ? 'Нет услуг' : 'От стоимости'}
      />
    </div>
  )
}
