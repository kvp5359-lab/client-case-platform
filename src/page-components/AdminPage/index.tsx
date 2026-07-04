"use client"

/**
 * Платформенная админка — только для администратора платформы (супер-админ).
 * Список воркспейсов, их тариф и потребление; смена тарифа.
 * Доступ enforced на сервере (RPC is_platform_admin); здесь — UX-гейт.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { useIsPlatformAdmin, useAdminWorkspaces, useSetWorkspacePlan, type AdminWorkspace } from '@/hooks/useAdmin'
import { usePlans } from '@/hooks/useWorkspaceUsage'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

function fmt(n: number | null): string {
  if (n == null) return '∞'
  return n.toLocaleString('ru-RU')
}

function TokenCell({ used, max }: { used: number; max: number | null }) {
  const pct = max && max > 0 ? Math.round((used / max) * 100) : null
  const danger = pct != null && pct >= 95
  return (
    <span className={danger ? 'text-red-600 font-medium' : 'text-gray-700'}>
      {fmt(used)}{max != null ? ` / ${fmt(max)}` : ''}
      {pct != null ? ` (${pct}%)` : ''}
    </span>
  )
}

function WorkspaceRow({ ws }: { ws: AdminWorkspace }) {
  const { data: plans } = usePlans()
  const setPlan = useSetWorkspacePlan()

  const onChange = async (code: string) => {
    try {
      await setPlan.mutateAsync({ workspaceId: ws.workspace_id, planCode: code === '' ? null : code })
      toast.success('Тариф обновлён')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось сменить тариф'))
    }
  }

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="px-3 py-2">
        <div className="font-medium text-gray-900">{ws.workspace_name}</div>
        <div className="text-xs text-gray-400">
          {new Date(ws.created_at).toLocaleDateString('ru-RU')}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-700">{ws.participants_count}</td>
      <td className="px-3 py-2 text-gray-700">{ws.projects_count}</td>
      <td className="px-3 py-2 text-gray-700">{fmt(ws.storage_mb)} МБ</td>
      <td className="px-3 py-2">
        <TokenCell used={ws.ai_tokens_used} max={ws.ai_tokens_monthly} />
      </td>
      <td className="px-3 py-2">
        <select
          className="rounded border px-2 py-1 text-sm"
          value={ws.plan_code ?? ''}
          disabled={setPlan.isPending}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Без тарифа (безлимит)</option>
          {(plans ?? []).map((p) => (
            <option key={p.code} value={p.code}>{p.name}</option>
          ))}
        </select>
      </td>
    </tr>
  )
}

export function AdminPage() {
  const { data: isAdmin, isLoading: checking } = useIsPlatformAdmin()
  const { data: workspaces, isLoading, error } = useAdminWorkspaces(isAdmin === true)
  const [query, setQuery] = useState('')

  if (checking) {
    return <div className="p-8 text-sm text-gray-500">Проверка доступа…</div>
  }
  if (!isAdmin) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold text-gray-900">Нет доступа</h1>
        <p className="text-sm text-gray-500 mt-1">Эта страница только для администратора платформы.</p>
      </div>
    )
  }

  const filtered = (workspaces ?? []).filter((w) =>
    w.workspace_name.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Админка платформы</h1>
        <p className="text-sm text-gray-500 mt-1">
          Тарифы и потребление всех воркспейсов. Токены — за текущий месяц.
        </p>
      </div>

      <input
        type="text"
        placeholder="Поиск по названию…"
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
                <th className="px-3 py-2 font-medium">Участники</th>
                <th className="px-3 py-2 font-medium">Проекты</th>
                <th className="px-3 py-2 font-medium">Хранилище</th>
                <th className="px-3 py-2 font-medium">Токены ИИ (мес)</th>
                <th className="px-3 py-2 font-medium">Тариф</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ws) => (
                <WorkspaceRow key={ws.workspace_id} ws={ws} />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Смена тарифа применяется сразу. «Без тарифа» = безлимит (как до внедрения тарифов).
      </p>
    </div>
  )
}
