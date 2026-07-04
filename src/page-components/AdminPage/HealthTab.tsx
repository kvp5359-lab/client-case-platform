"use client"

/**
 * Вкладка «Здоровье»: UI-зеркало scripts/channel-health.mjs с привязкой
 * к воркспейсам. Read-only — ничего не отправляет и не чинит само.
 */

import { usePlatformHealth } from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

const dt = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—'

function Check({
  ok,
  title,
  children,
}: {
  ok: boolean
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? '' : 'border-red-200 bg-red-50/50'}`}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
        <span>{ok ? '✅' : '⚠️'}</span>
        <span>{title}</span>
      </div>
      {!ok && children && <div className="mt-2 space-y-1">{children}</div>}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="text-xs text-gray-700 pl-6">{children}</div>
}

export function HealthTab() {
  const { data, isLoading, error, refresh, isFetching } = usePlatformHealth(true)

  if (isLoading) return <div className="p-6 text-sm text-gray-500">Загрузка…</div>
  if (error) {
    return <div className="p-6 text-sm text-red-600">{getUserFacingErrorMessage(error, 'Не удалось загрузить')}</div>
  }
  if (!data) return null

  const problems =
    data.stuck_pending.length +
    data.unresolved_failures.length +
    data.gmail_watch_expired.length +
    data.mtproto.stale.length +
    data.cron_failures_24h.length

  return (
    <div className="space-y-3 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {problems === 0 ? 'Все проверки зелёные.' : `Проблемных проверок: ${problems}`}
          <span className="text-gray-400"> · проверено {dt(data.checked_at)}</span>
        </p>
        <button
          className="rounded border px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50"
          disabled={isFetching}
          onClick={refresh}
        >
          {isFetching ? 'Проверяю…' : 'Проверить сейчас'}
        </button>
      </div>

      <Check ok={data.stuck_pending.length === 0} title="Застрявшие отправки (pending дольше 15 минут)">
        {data.stuck_pending.map((s) => (
          <Row key={s.workspace_id}>
            <b>{s.workspace_name ?? s.workspace_id}</b>: {s.count} шт, самое старое — {dt(s.oldest_at)}
          </Row>
        ))}
      </Check>

      <Check ok={data.unresolved_failures.length === 0} title="Незакрытые сбои отправки сообщений">
        {data.unresolved_failures.map((f) => (
          <Row key={f.workspace_id}>
            <b>{f.workspace_name ?? f.workspace_id}</b>: {f.count} шт, последний — {dt(f.last_at)}
            {f.last_error ? ` («${f.last_error.slice(0, 120)}»)` : ''}
          </Row>
        ))}
      </Check>

      <Check ok={data.gmail_watch_expired.length === 0} title="Протухший Gmail watch (входящие письма не приходят)">
        {data.gmail_watch_expired.map((g, i) => (
          <Row key={i}>
            <b>{g.workspace_name ?? g.workspace_id}</b>: {g.email}, истёк {dt(g.expired_at)}
          </Row>
        ))}
      </Check>

      <Check
        ok={data.mtproto.stale.length === 0}
        title={`MTProto-сессии (активных: ${data.mtproto.active}; «молчат» больше суток — сигнал)`}
      >
        {data.mtproto.stale.map((m, i) => (
          <Row key={i}>
            <b>{m.workspace_name ?? m.workspace_id}</b>: {m.tg_username ?? 'без username'}, видел{' '}
            {dt(m.last_seen_at)}
          </Row>
        ))}
      </Check>

      <Check ok={data.cron_failures_24h.length === 0} title="Падения фоновых задач (cron) за сутки">
        {data.cron_failures_24h.map((c) => (
          <Row key={c.jobname}>
            <b>{c.jobname}</b>: {c.count} шт, последнее — {dt(c.last_at)}
            {c.last_message ? ` («${c.last_message.slice(0, 120)}»)` : ''}
          </Row>
        ))}
      </Check>

      <p className="text-xs text-gray-400">
        Проверки read-only. Починка — руками: застрявшие отправки чинятся кнопкой «Повторить» у сообщения,
        Gmail watch — переподключением ящика, кроны — смотри журнал в БД.
      </p>
    </div>
  )
}
