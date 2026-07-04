"use client"

/**
 * Платформенная админка — только для администратора платформы (супер-админ).
 * Оболочка с вкладками; сами вкладки — в соседних файлах.
 * Доступ enforced на сервере (require_platform_admin); здесь — UX-гейт.
 * План: docs/feature-backlog/2026-07-04-platform-admin-console.md
 */

import { useState } from 'react'
import { useIsPlatformAdmin } from '@/hooks/useAdmin'
import { WorkspacesTab } from './WorkspacesTab'
import { BillingTab } from './BillingTab'
import { SettingsTab } from './SettingsTab'
import { AuditTab } from './AuditTab'

const TABS = [
  { key: 'workspaces', label: 'Воркспейсы' },
  { key: 'billing', label: 'Биллинг' },
  { key: 'settings', label: 'Настройки' },
  { key: 'audit', label: 'Журнал' },
] as const

type TabKey = (typeof TABS)[number]['key']

export function AdminPage() {
  const { data: isAdmin, isLoading: checking } = useIsPlatformAdmin()
  const [tab, setTab] = useState<TabKey>('workspaces')

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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Админка платформы</h1>
        <p className="text-sm text-gray-500 mt-1">Все воркспейсы, тарифы, потребление и журнал действий.</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'px-3 py-2 text-sm font-medium text-gray-900 border-b-2 border-gray-900 -mb-px'
                : 'px-3 py-2 text-sm text-gray-500 hover:text-gray-800'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'workspaces' && <WorkspacesTab />}
      {tab === 'billing' && <BillingTab />}
      {tab === 'settings' && <SettingsTab />}
      {tab === 'audit' && <AuditTab />}
    </div>
  )
}
