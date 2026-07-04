"use client"

/**
 * Вкладка «Объявления»: баннеры в сервисе (все или выбранные воркспейсы)
 * + выгрузка email-адресов владельцев (для рассылки вручную).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  useAdminAnnouncements,
  useUpsertAnnouncement,
  useDeleteAnnouncement,
  useAdminWorkspaces,
  fetchOwnerEmails,
  type AdminAnnouncement,
} from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { fmtDate } from './WorkspacesTab'

const inputCls = 'mt-0.5 w-full rounded border px-2 py-1 text-sm'

function AnnouncementForm({
  initial,
  onDone,
}: {
  initial: AdminAnnouncement | null
  onDone: () => void
}) {
  const { data: workspaces } = useAdminWorkspaces(true)
  const upsert = useUpsertAnnouncement()
  const [message, setMessage] = useState(initial?.message ?? '')
  const [level, setLevel] = useState<'info' | 'warning'>(initial?.level ?? 'info')
  const [endsAt, setEndsAt] = useState(initial?.ends_at ? initial.ends_at.slice(0, 10) : '')
  const [allWs, setAllWs] = useState(initial ? initial.workspace_ids == null : true)
  const [wsIds, setWsIds] = useState<string[]>(initial?.workspace_ids ?? [])
  const [isActive, setIsActive] = useState(initial?.is_active ?? true)

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        ...(initial ? { id: initial.id } : {}),
        message: message.trim(),
        level,
        ends_at: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        workspace_ids: allWs ? null : wsIds,
        is_active: isActive,
      })
      toast.success('Объявление сохранено')
      onDone()
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось сохранить'))
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-2.5 max-w-xl">
      <label className="block text-sm">
        <span className="text-gray-600">Текст объявления</span>
        <textarea className={`${inputCls} min-h-16`} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <div className="flex gap-3 flex-wrap">
        <label className="block text-sm">
          <span className="text-gray-600">Тип</span>
          <select className={inputCls} value={level} onChange={(e) => setLevel(e.target.value as 'info' | 'warning')}>
            <option value="info">Информация (синий)</option>
            <option value="warning">Предупреждение (жёлтый)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Показывать до (пусто = бессрочно)</span>
          <input className={inputCls} type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm pt-5">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>Включено</span>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allWs} onChange={(e) => setAllWs(e.target.checked)} />
        <span>Показывать всем воркспейсам</span>
      </label>
      {!allWs && (
        <div className="max-h-40 overflow-y-auto rounded border p-2 space-y-1">
          {(workspaces ?? []).filter((w) => !w.is_deleted).map((w) => (
            <label key={w.workspace_id} className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={wsIds.includes(w.workspace_id)}
                onChange={(e) =>
                  setWsIds((prev) =>
                    e.target.checked ? [...prev, w.workspace_id] : prev.filter((id) => id !== w.workspace_id),
                  )
                }
              />
              <span>{w.workspace_name}</span>
            </label>
          ))}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button className="rounded border px-3 py-1.5 text-sm" onClick={onDone}>Отмена</button>
        <button
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={upsert.isPending || !message.trim() || (!allWs && wsIds.length === 0)}
          onClick={onSave}
        >
          Сохранить
        </button>
      </div>
    </div>
  )
}

export function AnnouncementsTab() {
  const { data: announcements, isLoading } = useAdminAnnouncements(true)
  const deleteAnn = useDeleteAnnouncement()
  const [editing, setEditing] = useState<AdminAnnouncement | null>(null)
  const [creating, setCreating] = useState(false)
  const [exporting, setExporting] = useState(false)

  const onDelete = async (id: string) => {
    if (!window.confirm('Удалить объявление?')) return
    try {
      await deleteAnn.mutateAsync(id)
      toast.success('Удалено')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось удалить'))
    }
  }

  const onExportOwners = async () => {
    setExporting(true)
    try {
      const rows = await fetchOwnerEmails()
      const csv = ['Воркспейс;Владелец;Email', ...rows.map((r) => `${r.workspace_name};${r.owner_name};${r.owner_email}`)].join('\n')
      const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'owners.csv'
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось выгрузить'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">Объявления (баннер в сервисе)</h2>
        <div className="flex gap-2">
          <button className="rounded border px-2.5 py-1 text-sm hover:bg-gray-50 disabled:opacity-50" disabled={exporting} onClick={onExportOwners}>
            {exporting ? 'Выгружаю…' : 'Скачать email владельцев (CSV)'}
          </button>
          <button className="rounded bg-gray-900 px-2.5 py-1 text-sm text-white" onClick={() => { setCreating(true); setEditing(null) }}>
            + Новое объявление
          </button>
        </div>
      </div>

      {(creating || editing) && (
        <AnnouncementForm
          initial={editing}
          onDone={() => { setCreating(false); setEditing(null) }}
        />
      )}

      <div className="rounded-lg border overflow-x-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">Загрузка…</div>
        ) : !announcements || announcements.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">Объявлений нет.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Текст</th>
                <th className="px-3 py-2 font-medium">Тип</th>
                <th className="px-3 py-2 font-medium">Кому</th>
                <th className="px-3 py-2 font-medium">До</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {announcements.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="px-3 py-2 text-gray-900 max-w-md truncate" title={a.message}>{a.message}</td>
                  <td className="px-3 py-2 text-gray-700">{a.level === 'warning' ? '⚠️' : 'ℹ️'}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {a.workspace_ids == null ? 'всем' : `${a.workspace_ids.length} воркс.`}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{a.ends_at ? fmtDate(a.ends_at) : 'бессрочно'}</td>
                  <td className="px-3 py-2">
                    {a.is_active ? <span className="text-emerald-600 text-xs">вкл</span> : <span className="text-gray-400 text-xs">выкл</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button className="text-xs text-blue-600 hover:underline mr-3" onClick={() => { setEditing(a); setCreating(false) }}>
                      изменить
                    </button>
                    <button className="text-xs text-red-600 hover:underline" onClick={() => onDelete(a.id)}>
                      удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
