/**
 * AuditPill — сервисное уведомление в ленте «Всей истории».
 * Визуально идентичен ServiceMessage из мессенджера: центрированная пилюля
 * со временем, цветные имена статусов для change_status, читаемый формат
 * для дедлайна/переименования и т.д.
 */

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import type { AuditLogEntry } from '@/types/history'

interface AuditPillProps {
  entry: AuditLogEntry
  isUnread?: boolean
  /** id статуса → {name, color}. Если статус удалён — не попадёт в карту. */
  statusMap?: Map<string, { name: string; color: string | null }>
}

const ACTION_LABELS: Record<string, string> = {
  change_status: 'изменил(а) статус',
  change_deadline: 'изменил(а) дедлайн',
  rename: 'переименовал(а)',
  create: 'создал(а)',
  delete: 'удалил(а)',
  soft_delete: 'переместил(а) в корзину',
  change_settings: 'изменил(а) настройки',
  pin: 'закрепил(а)',
  unpin: 'открепил(а)',
  change_assignees: 'изменил(а) исполнителей',
  add_participant: 'добавил(а) участника',
  remove_participant: 'удалил(а) участника',
}

function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return 'без срока'
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function safeCssColor(value: string): string | undefined {
  // Допускаем только hex / короткие имена — защита от CSS-инъекции через data.
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$/.test(value) ? value : undefined
}

function buildContent(
  entry: AuditLogEntry,
  statusMap?: AuditPillProps['statusMap'],
): ReactNode {
  const details = (entry.details ?? {}) as Record<string, unknown>
  const actor = entry.actor_name ?? 'Система'
  const label = ACTION_LABELS[entry.action] ?? entry.action

  if (entry.action === 'change_status') {
    const oldId = typeof details.old_status === 'string' ? details.old_status : null
    const newId = typeof details.new_status === 'string' ? details.new_status : null
    const oldEntry = oldId ? statusMap?.get(oldId) : undefined
    const newEntry = newId ? statusMap?.get(newId) : undefined
    return (
      <>
        <span className="font-medium">{actor}</span> {label}:{' '}
        <span
          className="font-medium"
          style={
            oldEntry?.color ? { color: safeCssColor(oldEntry.color) } : undefined
          }
        >
          {oldEntry?.name ?? 'без статуса'}
        </span>
        {' → '}
        <span
          className="font-medium"
          style={
            newEntry?.color ? { color: safeCssColor(newEntry.color) } : undefined
          }
        >
          {newEntry?.name ?? 'без статуса'}
        </span>
      </>
    )
  }

  if (entry.action === 'change_deadline') {
    const oldD = formatDeadline(details.old_deadline as string | null)
    const newD = formatDeadline(details.new_deadline as string | null)
    return (
      <>
        <span className="font-medium">{actor}</span> {label}: {oldD} → {newD}
      </>
    )
  }

  if (entry.action === 'rename') {
    return (
      <>
        <span className="font-medium">{actor}</span> {label}: «
        {String(details.old_name ?? '')}» → «{String(details.new_name ?? '')}»
      </>
    )
  }

  // Fallback — имя актора + действие + (название ресурса если есть)
  const name = (details.name ?? details.title) as string | undefined
  return (
    <>
      <span className="font-medium">{actor}</span> {label}
      {name ? <> «{name}»</> : null}
    </>
  )
}

export function AuditPill({ entry, isUnread, statusMap }: AuditPillProps) {
  const timeStr = new Date(entry.created_at).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="flex justify-center py-1 px-2">
      <span
        className={cn(
          'text-xs px-3 py-1 rounded-full border max-w-full',
          isUnread
            ? 'text-red-600 bg-red-50 border-red-300'
            : 'text-muted-foreground bg-muted/60 border-transparent',
        )}
      >
        {buildContent(entry, statusMap)} · {timeStr}
      </span>
    </div>
  )
}
