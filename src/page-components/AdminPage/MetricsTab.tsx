"use client"

/**
 * Вкладка «Метрики»: рост платформы — регистрации, активность, тарифы, выручка.
 * Простые CSS-бары, без библиотек графиков.
 */

import { useGrowthMetrics } from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

const num = (n: number) => n.toLocaleString('ru-RU')

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}

function WeekBars({ items }: { items: Array<{ week: string; count: number }> }) {
  if (items.length === 0) return <p className="text-xs text-gray-400">Данных за период нет.</p>
  const max = Math.max(...items.map((i) => i.count), 1)
  return (
    <div className="space-y-1">
      {items.map((i) => (
        <div key={i.week} className="flex items-center gap-2 text-xs">
          <span className="w-24 text-gray-500">
            {new Date(i.week).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}
          </span>
          <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden">
            <div className="h-full bg-blue-400" style={{ width: `${Math.max(2, Math.round((i.count / max) * 100))}%` }} />
          </div>
          <span className="w-10 text-right text-gray-700">{i.count}</span>
        </div>
      ))}
    </div>
  )
}

export function MetricsTab() {
  const { data, isLoading, error } = useGrowthMetrics(true)

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Загрузка…</div>
  if (error) {
    return <div className="p-6 text-sm text-red-600">{getUserFacingErrorMessage(error, 'Не удалось загрузить')}</div>
  }
  if (!data) return null

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Пользователей" value={num(data.totals.users)} />
        <StatCard label="Воркспейсов" value={num(data.totals.workspaces)} />
        <StatCard label="Активных за 7 дней" value={num(data.totals.active_ws_7d)} />
        <StatCard label="Активных за 30 дней" value={num(data.totals.active_ws_30d)} />
        <StatCard label="Платящих" value={num(data.totals.paying)} />
        <StatCard label="На триале" value={num(data.totals.on_trial)} />
        <StatCard label="Просрочено" value={num(data.totals.past_due)} />
      </div>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Регистрации пользователей по неделям</h2>
        <WeekBars items={data.signups_by_week} />
      </section>

      <section className="rounded-lg border p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Новые воркспейсы по неделям</h2>
        <WeekBars items={data.workspaces_by_week} />
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Воркспейсы по тарифам</h2>
          {data.plan_distribution.map((p) => (
            <div key={p.plan} className="flex justify-between text-sm">
              <span className="text-gray-600">{p.plan}</span>
              <span className="text-gray-900">{num(p.count)}</span>
            </div>
          ))}
        </section>

        <section className="rounded-lg border p-4 space-y-2">
          <h2 className="text-sm font-semibold text-gray-900">Выручка по месяцам</h2>
          {data.revenue_by_month.length === 0 ? (
            <p className="text-xs text-gray-400">Платежей ещё не было.</p>
          ) : (
            data.revenue_by_month.map((r) => (
              <div key={`${r.month}-${r.currency}`} className="flex justify-between text-sm">
                <span className="text-gray-600">
                  {new Date(r.month).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
                </span>
                <span className="text-gray-900">{num(r.amount)} {r.currency}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
