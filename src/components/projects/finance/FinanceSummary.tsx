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
  tone?: 'default' | 'positive' | 'negative' | 'income' | 'expense'
}

function StatCard({ label, value, hint, tone = 'default' }: CardProps) {
  const valueColor =
    tone === 'positive' || tone === 'income'
      ? 'text-emerald-700'
      : tone === 'negative' || tone === 'expense'
        ? 'text-red-700'
        : 'text-gray-900'
  // Для «Доходов» используем синий акцент (как у тега «Итого» в таблице
  // доходов), а зелёный сохраняем за прибылью.
  const incomeColor = tone === 'income' ? 'text-blue-700' : valueColor
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${incomeColor}`}>{value}</div>
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
    // subtotal — без налога, taxTotal — суммарный налог по всем услугам,
    // cost — итог с налогом (то, что должен заплатить клиент).
    let subtotal = 0
    let taxTotal = 0
    for (const s of services) {
      const sub = Number(s.total ?? 0)
      const rate = s.tax_rate == null ? 0 : Number(s.tax_rate)
      subtotal += sub
      taxTotal += sub * (rate / 100)
    }
    const cost = subtotal + taxTotal

    const incomeSum = incomes.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
    const expenseSum = expenses.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)

    // Налог в полученных доходах — пропорционально оплаченной доле услуг:
    // если клиент заплатил половину — половина НДС считается «начисленной».
    const taxInIncome = cost > 0 ? incomeSum * (taxTotal / cost) : 0

    const profit = incomeSum - expenseSum - taxInIncome
    const paymentPct = cost > 0 ? (incomeSum / cost) * 100 : null
    return { cost, incomeSum, expenseSum, profit, paymentPct, taxInIncome }
  }, [services, incomes, expenses])

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      <StatCard label="Стоимость" value={`${fmt(stats.cost)} EUR`} hint="Услуги проекта с налогом" />
      <StatCard
        label="Доходы"
        value={`${fmt(stats.incomeSum)} EUR`}
        tone="income"
      />
      <StatCard
        label="Расходы"
        value={`${fmt(stats.expenseSum)} EUR`}
        tone="expense"
      />
      <StatCard
        label="Прибыль"
        value={`${fmt(stats.profit)} EUR`}
        tone={stats.profit >= 0 ? 'positive' : 'negative'}
        hint={
          stats.taxInIncome > 0
            ? `Доходы − расходы − налог (${fmt(stats.taxInIncome)})`
            : 'Доходы − расходы'
        }
      />
      <StatCard
        label="Оплачено"
        value={stats.paymentPct === null ? '—' : `${stats.paymentPct.toFixed(0)}%`}
        hint={stats.paymentPct === null ? 'Нет услуг' : 'От стоимости'}
      />
    </div>
  )
}
