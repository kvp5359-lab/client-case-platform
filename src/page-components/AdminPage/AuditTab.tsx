"use client"

/**
 * Вкладка «Журнал»: аудит действий платформенного админа
 * (кто, когда, что сделал, с каким воркспейсом).
 */

import { useAdminAudit } from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'

const ACTION_LABELS: Record<string, string> = {
  set_plan: 'Смена тарифа',
  suspend_workspace: 'Блокировка воркспейса',
  unsuspend_workspace: 'Разблокировка воркспейса',
  record_payment: 'Отметка оплаты',
  delete_payment: 'Удаление оплаты',
  upsert_plan: 'Правка тарифа',
  set_billing_dates: 'Правка дат биллинга',
  ban_user: 'Блокировка аккаунта',
  unban_user: 'Разблокировка аккаунта',
  impersonate_workspace_owner: 'Вход под владельца воркспейса',
  upsert_announcement: 'Правка объявления',
  delete_announcement: 'Удаление объявления',
  set_platform_config: 'Настройки платформы',
  create_invite: 'Создание инвайта',
  delete_invite: 'Удаление инвайта',
}

function detailsText(details: Record<string, unknown> | null): string {
  if (!details) return ''
  return Object.entries(details)
    .map(([k, v]) => `${k}: ${v === null ? '—' : String(v)}`)
    .join(', ')
}

export function AuditTab() {
  const { data: entries, isLoading, error } = useAdminAudit(true)

  return (
    <div className="rounded-lg border overflow-x-auto">
      {isLoading ? (
        <div className="p-6 text-sm text-gray-500">Загрузка…</div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">{getUserFacingErrorMessage(error, 'Не удалось загрузить журнал')}</div>
      ) : !entries || entries.length === 0 ? (
        <div className="p-6 text-sm text-gray-500">Журнал пуст — действий пока не было.</div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
              <th className="px-3 py-2 font-medium">Когда</th>
              <th className="px-3 py-2 font-medium">Админ</th>
              <th className="px-3 py-2 font-medium">Действие</th>
              <th className="px-3 py-2 font-medium">Воркспейс</th>
              <th className="px-3 py-2 font-medium">Детали</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString('ru-RU', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </td>
                <td className="px-3 py-2 text-gray-700">{e.admin_email ?? e.target_user_id ?? '—'}</td>
                <td className="px-3 py-2 text-gray-900">{ACTION_LABELS[e.action] ?? e.action}</td>
                <td className="px-3 py-2 text-gray-700">{e.workspace_name ?? '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{detailsText(e.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
