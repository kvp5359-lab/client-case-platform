"use client"

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useWorkspacePermissions } from '@/hooks/permissions'
import {
  useWorkspaceUsageAndLimits,
  useUpdateWorkspaceLimits,
  useExportWorkspace,
} from '@/hooks/useWorkspaceUsage'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { downloadBlob } from '@/utils/files/downloadBlob'

function UsageRow({ label, used, max, unit }: { label: string; used: number; max: number | null; unit?: string }) {
  const pct = max && max > 0 ? Math.min(100, Math.round((used / max) * 100)) : null
  const over = max != null && used >= max
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-gray-700">{label}</span>
        <span className={over ? 'text-red-600 font-medium' : 'text-gray-600'}>
          {used}
          {unit ? ` ${unit}` : ''} {max != null ? `/ ${max}${unit ? ` ${unit}` : ''}` : '(без лимита)'}
        </span>
      </div>
      {pct != null && (
        <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${over ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  )
}

export function WorkspaceUsageSection({ workspaceId }: { workspaceId: string }) {
  const { isOwner } = useWorkspacePermissions({ workspaceId })
  const { data: usage, isLoading } = useWorkspaceUsageAndLimits(workspaceId)
  const updateLimits = useUpdateWorkspaceLimits(workspaceId)
  const exportWs = useExportWorkspace(workspaceId)

  const [editLimits, setEditLimits] = useState<{ p: string; pr: string; st: string } | null>(null)

  const handleExport = async () => {
    try {
      const data = await exportWs.mutateAsync()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      downloadBlob(blob, `workspace-export-${new Date().toISOString().slice(0, 10)}.json`)
      toast.success('Данные выгружены')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось выгрузить данные'))
    }
  }

  const startEdit = () => {
    setEditLimits({
      p: usage?.max_participants?.toString() ?? '',
      pr: usage?.max_projects?.toString() ?? '',
      st: usage?.max_storage_mb?.toString() ?? '',
    })
  }

  const saveLimits = async () => {
    if (!editLimits) return
    const toNum = (s: string) => (s.trim() === '' ? null : Math.max(0, parseInt(s, 10) || 0))
    try {
      await updateLimits.mutateAsync({
        max_participants: toNum(editLimits.p),
        max_projects: toNum(editLimits.pr),
        max_storage_mb: toNum(editLimits.st),
      })
      setEditLimits(null)
      toast.success('Лимиты сохранены')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось сохранить лимиты'))
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Использование и данные</h3>
        <p className="text-sm text-gray-500 mt-1">
          Текущее потребление воркспейса и выгрузка данных.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-3">
        {isLoading ? (
          <p className="text-sm text-gray-500">Загрузка…</p>
        ) : usage ? (
          <>
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-sm text-gray-700">Тариф</span>
              <span className="text-sm font-medium text-gray-900">
                {usage.plan_name ?? 'Без тарифа (безлимит)'}
              </span>
            </div>
            <UsageRow label="Участники (команда)" used={usage.participants_count} max={usage.max_participants} />
            <UsageRow label="Проекты" used={usage.projects_count} max={usage.max_projects} />
            <UsageRow label="Хранилище" used={usage.storage_mb} max={usage.max_storage_mb} unit="МБ" />
            <UsageRow
              label="Токены ИИ за месяц"
              used={usage.ai_tokens_used ?? 0}
              max={usage.ai_tokens_monthly}
            />
          </>
        ) : (
          <p className="text-sm text-gray-500">Нет данных</p>
        )}
      </div>

      {isOwner && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-900">Лимиты</span>
            {!editLimits && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                Изменить
              </Button>
            )}
          </div>
          {editLimits ? (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="text-gray-600">Макс. участников (пусто = без лимита)</span>
                <Input type="number" min={0} value={editLimits.p} onChange={(e) => setEditLimits({ ...editLimits, p: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Макс. проектов</span>
                <Input type="number" min={0} value={editLimits.pr} onChange={(e) => setEditLimits({ ...editLimits, pr: e.target.value })} />
              </label>
              <label className="block text-sm">
                <span className="text-gray-600">Макс. хранилище, МБ</span>
                <Input type="number" min={0} value={editLimits.st} onChange={(e) => setEditLimits({ ...editLimits, st: e.target.value })} />
              </label>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveLimits} disabled={updateLimits.isPending}>
                  Сохранить
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditLimits(null)}>
                  Отмена
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Лимиты пока не блокируют создание — только для контроля. Жёсткое применение подключается отдельно.
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Пусто = без лимита. Значения показываются в потреблении выше.
            </p>
          )}
        </div>
      )}

      {isOwner && (
        <div className="rounded-lg border p-4 space-y-2">
          <span className="text-sm font-medium text-gray-900">Экспорт данных</span>
          <p className="text-sm text-gray-500">
            Выгрузка структуры воркспейса (проекты, участники, чаты) в JSON. Полная выгрузка
            сообщений и файлов — по отдельному запросу.
          </p>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exportWs.isPending}>
            {exportWs.isPending ? 'Готовим…' : 'Выгрузить в JSON'}
          </Button>
        </div>
      )}
    </div>
  )
}
