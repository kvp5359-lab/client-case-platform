/**
 * FinanceSummary — карточки сверху на вкладке «Финансы».
 * Считает агрегаты на фронте по уже загруженным данным
 * (project_services + project_transactions).
 */

import { useMemo } from 'react'
import { useProjectServices } from '@/hooks/projects/useProjectServices'
import { useProjectTransactions } from '@/hooks/projects/useProjectTransactions'
import { formatMoney, formatAmount as fmt } from '@/lib/currency'

type CardProps = {
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

type Props = {
  projectId: string
  /** Валюта проекта (ISO-код) — только отображение сумм. */
  currency: string
}

export function FinanceSummary({ projectId, currency }: Props) {
  const { data: services = [] } = useProjectServices(projectId)
  const { data: incomes = [] } = useProjectTransactions(projectId, 'income')
  const { data: expenses = [] } = useProjectTransactions(projectId, 'expense')

  const stats = useMemo(() => {
    // Стоимость = сумма позиций с учётом налога (subtotal + налог сверху).
    // Параллельно — разбивка «пакет + допы» (is_extra).
    let cost = 0
    let extraCost = 0
    for (const s of services) {
      const sub = Number(s.total ?? 0)
      const rate = s.tax_rate == null ? 0 : Number(s.tax_rate)
      const withTax = sub * (1 + rate / 100)
      cost += withTax
      if (s.is_extra) extraCost += withTax
    }

    const incomeSum = incomes.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)
    const expenseSum = expenses.reduce((acc, t) => acc + Number(t.amount ?? 0), 0)

    // Чистая сумма транзакции = amount × 100 / (100 + tax_rate). Если ставка
    // не указана, считаем что в amount нет налога — берём amount как есть.
    const netAmount = (amount: number, rate: number | null): number => {
      const r = rate ?? 0
      return r > 0 ? (amount * 100) / (100 + r) : amount
    }
    const incomeNet = incomes.reduce(
      (acc, t) => acc + netAmount(Number(t.amount ?? 0), t.tax_rate == null ? null : Number(t.tax_rate)),
      0,
    )
    const expenseNet = expenses.reduce(
      (acc, t) => acc + netAmount(Number(t.amount ?? 0), t.tax_rate == null ? null : Number(t.tax_rate)),
      0,
    )
    const taxInIncome = incomeSum - incomeNet
    const taxInExpense = expenseSum - expenseNet

    // Прибыль = чистые_доходы − чистые_расходы.
    const profit = incomeNet - expenseNet
    const paymentPct = cost > 0 ? (incomeSum / cost) * 100 : null
    // Остаток к оплате = стоимость − полученные доходы (отрицательный = переплата).
    const remaining = cost - incomeSum
    return {
      cost,
      extraCost,
      incomeSum,
      expenseSum,
      profit,
      paymentPct,
      remaining,
      taxInIncome,
      taxInExpense,
    }
  }, [services, incomes, expenses])

  // auto-fit по фактической ширине (а не брейкпоинты окна): при открытой
  // боковой панели контент уже, и карточки сами переносятся на новый ряд.
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
      <StatCard
        label="Стоимость"
        value={formatMoney(stats.cost, currency)}
        hint={
          stats.extraCost > 0
            ? `Пакет ${fmt(stats.cost - stats.extraCost)} + допы ${fmt(stats.extraCost)}`
            : 'Услуги проекта с налогом'
        }
      />
      <StatCard
        label="Доходы"
        value={formatMoney(stats.incomeSum, currency)}
        tone="income"
      />
      <StatCard
        label="Расходы"
        value={formatMoney(stats.expenseSum, currency)}
        tone="expense"
      />
      <StatCard
        label="Прибыль"
        value={formatMoney(stats.profit, currency)}
        tone={stats.profit >= 0 ? 'positive' : 'negative'}
        hint={
          stats.taxInIncome > 0 || stats.taxInExpense > 0
            ? 'Чистые доходы − чистые расходы (без налога)'
            : 'Доходы − расходы'
        }
      />
      <StatCard
        label={stats.remaining < 0 ? 'Переплата' : 'Остаток'}
        value={
          stats.paymentPct === null
            ? '—'
            : formatMoney(Math.abs(stats.remaining), currency)
        }
        hint={
          stats.paymentPct === null
            ? 'Нет услуг'
            : stats.remaining === 0
              ? 'Оплачено полностью'
              : `Оплачено ${stats.paymentPct.toFixed(0)}% от стоимости`
        }
      />
    </div>
  )
}
