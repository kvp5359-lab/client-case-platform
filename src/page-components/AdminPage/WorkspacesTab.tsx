"use client"

/**
 * Вкладка «Воркспейсы»: таблица всех воркспейсов платформы.
 * Статус, владелец, потребление, тариф, блокировка; клик по строке — карточка.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  useAdminWorkspaces,
  useSetWorkspacePlan,
  useSuspendWorkspace,
  type AdminWorkspace,
} from '@/hooks/useAdmin'
import { usePlans } from '@/hooks/useWorkspaceUsage'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { WorkspaceDetailsDialog } from './WorkspaceDetailsDialog'

export function fmtNum(n: number | null): string {
  if (n == null) return '∞'
  return n.toLocaleString('ru-RU')
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ru-RU')
}

function TokenCell({ used, max }: { used: number; max: number | null }) {
  const pct = max && max > 0 ? Math.round((used / max) * 100) : null
  const danger = pct != null && pct >= 95
  return (
    <span className={danger ? 'text-red-600 font-medium' : 'text-gray-700'}>
      {fmtNum(used)}{max != null ? ` / ${fmtNum(max)}` : ''}
      {pct != null ? ` (${pct}%)` : ''}
    </span>
  )
}

export function StatusBadge({ ws }: { ws: Pick<AdminWorkspace, 'is_suspended' | 'is_deleted' | 'billing_status' | 'trial_ends_at'> }) {
  if (ws.is_deleted) {
    return <span className="inline-block rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">Удалён</span>
  }
  if (ws.is_suspended) {
    return <span className="inline-block rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">Заблокирован</span>
  }
  if (ws.billing_status === 'past_due') {
    return <span className="inline-block rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">Просрочен</span>
  }
  if (ws.billing_status === 'trial') {
    return (
      <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">
        Триал{ws.trial_ends_at ? ` до ${fmtDate(ws.trial_ends_at)}` : ''}
      </span>
    )
  }
  return <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700">Активен</span>
}

function WorkspaceRow({ ws, onOpen }: { ws: AdminWorkspace; onOpen: (id: string) => void }) {
  const { data: plans } = usePlans()
  const setPlan = useSetWorkspacePlan()
  const suspend = useSuspendWorkspace()

  const onPlanChange = async (code: string) => {
    try {
      await setPlan.mutateAsync({ workspaceId: ws.workspace_id, planCode: code === '' ? null : code })
      toast.success('Тариф обновлён')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось сменить тариф'))
    }
  }

  const onToggleSuspend = async () => {
    const next = !ws.is_suspended
    if (next && !window.confirm(`Заблокировать воркспейс «${ws.workspace_name}»? Все его участники потеряют доступ.`)) {
      return
    }
    try {
      await suspend.mutateAsync({ workspaceId: ws.workspace_id, suspended: next })
      toast.success(next ? 'Воркспейс заблокирован' : 'Воркспейс разблокирован')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось изменить статус'))
    }
  }

  return (
    <tr className="border-b hover:bg-gray-50 cursor-pointer" onClick={() => onOpen(ws.workspace_id)}>
      <td className="px-3 py-2">
        <div className="font-medium text-gray-900">{ws.workspace_name}</div>
        <div className="text-xs text-gray-400">
          {ws.owner_email ?? 'владелец не найден'} · с {fmtDate(ws.created_at)}
        </div>
      </td>
      <td className="px-3 py-2">
        <StatusBadge ws={ws} />
        <div className="text-xs text-gray-400 mt-0.5">актив. {fmtDate(ws.last_activity_at)}</div>
      </td>
      <td className="px-3 py-2 text-gray-700">{ws.participants_count}</td>
      <td className="px-3 py-2 text-gray-700">{ws.projects_count}</td>
      <td className="px-3 py-2 text-gray-700">{fmtNum(ws.storage_mb)} МБ</td>
      <td className="px-3 py-2">
        <TokenCell used={ws.ai_tokens_used} max={ws.ai_tokens_monthly} />
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <select
          className="rounded border px-2 py-1 text-sm"
          value={ws.plan_code ?? ''}
          disabled={setPlan.isPending}
          onChange={(e) => onPlanChange(e.target.value)}
        >
          <option value="">Без тарифа (безлимит)</option>
          {(plans ?? []).map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={onToggleSuspend}
          disabled={suspend.isPending}
          className={
            ws.is_suspended
              ? 'rounded border border-emerald-300 px-2 py-1 text-xs text-emerald-700 hover:bg-emerald-50'
              : 'rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50'
          }
        >
          {ws.is_suspended ? 'Разблокировать' : 'Заблокировать'}
        </button>
      </td>
    </tr>
  )
}

export function WorkspacesTab() {
  const { data: workspaces, isLoading, error } = useAdminWorkspaces(true)
  const [query, setQuery] = useState('')
  const [openedId, setOpenedId] = useState<string | null>(null)

  const filtered = (workspaces ?? []).filter((w) => {
    const q = query.toLowerCase()
    return (
      w.workspace_name.toLowerCase().includes(q) ||
      (w.owner_email ?? '').toLowerCase().includes(q) ||
      (w.owner_name ?? '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Поиск по названию или владельцу…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full max-w-sm rounded border px-3 py-1.5 text-sm"
      />

      <div className="rounded-lg border overflow-x-auto">
        {isLoading ? (
          <div className="p-6 text-sm text-gray-500">Загрузка…</div>
        ) : error ? (
          <div className="p-6 text-sm text-red-600">
            {getUserFacingErrorMessage(error, 'Не удалось загрузить список')}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">Ничего не найдено</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Воркспейс</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Участники</th>
                <th className="px-3 py-2 font-medium">Проекты</th>
                <th className="px-3 py-2 font-medium">Хранилище</th>
                <th className="px-3 py-2 font-medium">Токены ИИ (мес)</th>
                <th className="px-3 py-2 font-medium">Тариф</th>
                <th className="px-3 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ws) => (
                <WorkspaceRow key={ws.workspace_id} ws={ws} onOpen={setOpenedId} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Смена тарифа применяется сразу. «Без тарифа» = безлимит. Клик по строке — карточка воркспейса.
      </p>

      <WorkspaceDetailsDialog workspaceId={openedId} onClose={() => setOpenedId(null)} />
    </div>
  )
}
