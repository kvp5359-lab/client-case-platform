"use client"

/**
 * Вкладка «Потребление»: топы воркспейсов по токенам/хранилищу/сообщениям
 * и динамика токенов ИИ платформы по месяцам. CSS-бары, без библиотек графиков.
 */

import { useUsageOverview } from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('ru-RU')

function BarList({
  items,
}: {
  items: Array<{ key: string; label: string; value: number; suffix?: string; danger?: boolean }>
}) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="space-y-1">
      {items.map((i) => (
        <div key={i.key} className="flex items-center gap-2 text-xs">
          <span className="w-44 truncate text-gray-700" title={i.label}>{i.label}</span>
          <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden">
            <div
              className={`h-full ${i.danger ? 'bg-red-400' : 'bg-blue-400'}`}
              style={{ width: `${Math.max(2, Math.round((i.value / max) * 100))}%` }}
            />
          </div>
          <span className="w-28 text-right text-gray-700">
            {num(i.value)}{i.suffix ?? ''}
          </span>
        </div>
      ))}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  )
}

export function UsageTab() {
  const { data, isLoading, error } = useUsageOverview(true)

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Загрузка…</div>
  if (error) {
    return <div className="p-6 text-sm text-red-600">{getUserFacingErrorMessage(error, 'Не удалось загрузить')}</div>
  }
  if (!data) return null

  return (
    <div className="space-y-4 max-w-3xl">
      <Section title="Токены ИИ за текущий месяц — топ воркспейсов">
        {data.top_ai.length === 0 ? (
          <p className="text-xs text-gray-400">Расход токенов ещё не копился (учёт начался недавно).</p>
        ) : (
          <BarList
            items={data.top_ai.map((t) => ({
              key: t.workspace_id,
              label: t.workspace_name ?? t.workspace_id,
              value: t.tokens,
              suffix: t.quota != null ? ` / ${num(t.quota)}` : '',
              danger: t.quota != null && t.tokens >= 0.9 * t.quota,
            }))}
          />
        )}
      </Section>

      <Section title="Хранилище — топ воркспейсов">
        <BarList
          items={data.top_storage.map((t) => ({
            key: t.workspace_id,
            label: t.workspace_name ?? t.workspace_id,
            value: t.mb,
            suffix: ' МБ',
          }))}
        />
      </Section>

      <Section title="Сообщения за 30 дней — топ воркспейсов">
        <BarList
          items={data.top_messages_30d.map((t) => ({
            key: t.workspace_id,
            label: t.workspace_name ?? t.workspace_id,
            value: t.count,
          }))}
        />
      </Section>

      <Section title="Токены ИИ платформы по месяцам">
        {data.ai_by_month.length === 0 ? (
          <p className="text-xs text-gray-400">Данных пока нет.</p>
        ) : (
          <BarList
            items={data.ai_by_month.map((m) => ({
              key: m.period,
              label: new Date(m.period).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
              value: m.tokens,
              suffix: ` (${num(m.requests)} запр.)`,
            }))}
          />
        )}
      </Section>
    </div>
  )
}
