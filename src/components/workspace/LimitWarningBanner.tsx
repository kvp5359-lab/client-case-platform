"use client"

/**
 * Баннер-предупреждение, когда лимит тарифа подошёл к 95% или достигнут.
 * Показывается вверху контента воркспейса. Пока тариф не назначен или всё в
 * норме — не рендерится (пустой массив предупреждений).
 */

import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useWorkspaceLimitStatus } from '@/hooks/useWorkspaceUsage'

export function LimitWarningBanner({ workspaceId }: { workspaceId: string | undefined }) {
  const { warnings } = useWorkspaceLimitStatus(workspaceId)
  const [dismissed, setDismissed] = useState(false)

  if (!workspaceId || warnings.length === 0 || dismissed) return null

  const atLimit = warnings.filter((w) => w.atLimit)
  const critical = atLimit.length > 0

  const names = (critical ? atLimit : warnings).map((w) => `${w.label} (${w.pct}%)`).join(', ')

  return (
    <div
      className={`flex items-start gap-2 px-4 py-2 text-sm border-b ${
        critical ? 'bg-red-50 text-red-800 border-red-200' : 'bg-amber-50 text-amber-800 border-amber-200'
      }`}
      role="status"
    >
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        {critical
          ? <>Достигнут лимит тарифа: <b>{names}</b>. Создание новых записей заблокировано — повысьте тариф.</>
          : <>Приближается лимит тарифа: <b>{names}</b>.</>}
        {' '}
        <Link href={`/workspaces/${workspaceId}/settings/general`} className="underline whitespace-nowrap">
          Открыть «Использование»
        </Link>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="text-xs underline opacity-70 hover:opacity-100 shrink-0"
        aria-label="Скрыть"
      >
        Скрыть
      </button>
    </div>
  )
}
