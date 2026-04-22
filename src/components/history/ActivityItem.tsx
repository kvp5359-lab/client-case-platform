/**
 * Одно событие в ленте истории
 */

import {
  Trash2,
  Download,
  Upload,
  UserPlus,
  UserMinus,
  Shield,
  FilePlus,
  Archive,
  Merge,
  Bot,
  Eye,
  RotateCcw,
  ArrowRightLeft,
  Pencil,
  Calendar,
  ClipboardEdit,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AuditLogEntry } from '@/types/history'
import { formatShortDate } from '@/utils/format/dateFormat'

interface ActivityItemProps {
  entry: AuditLogEntry
  isUnread: boolean
  /** Карта id → название статуса. Нужна чтобы в change_status вместо UUID показать имя. */
  statusNames?: Map<string, string>
}

// Маппинг action → иконка и цвет
const ACTION_CONFIG: Record<string, { icon: LucideIcon; color: string; label: string }> = {
  // Создание
  create: { icon: FilePlus, color: 'text-green-500 bg-green-50', label: 'создал' },
  // Удаление
  delete: { icon: Trash2, color: 'text-red-500 bg-red-50', label: 'удалил' },
  soft_delete: {
    icon: Trash2,
    color: 'text-orange-500 bg-orange-50',
    label: 'переместил в корзину',
  },
  batch_delete: {
    icon: Trash2,
    color: 'text-orange-500 bg-orange-50',
    label: 'переместил в корзину',
  },
  batch_hard_delete: { icon: Trash2, color: 'text-red-500 bg-red-50', label: 'удалил навсегда' },
  restore: {
    icon: RotateCcw,
    color: 'text-green-500 bg-green-50',
    label: 'восстановил из корзины',
  },
  // Скачивание и экспорт
  download: { icon: Download, color: 'text-blue-500 bg-blue-50', label: 'скачал' },
  batch_download: { icon: Download, color: 'text-blue-500 bg-blue-50', label: 'скачал архив' },
  export_to_drive: {
    icon: Upload,
    color: 'text-green-500 bg-green-50',
    label: 'экспортировал на Google Drive',
  },
  // Участники
  add_participant: {
    icon: UserPlus,
    color: 'text-emerald-500 bg-emerald-50',
    label: 'добавил участника',
  },
  remove_participant: {
    icon: UserMinus,
    color: 'text-red-500 bg-red-50',
    label: 'удалил участника',
  },
  update_roles: {
    icon: Shield,
    color: 'text-violet-500 bg-violet-50',
    label: 'изменил роли участника',
  },
  // Статусы и изменения
  change_status: {
    icon: ArrowRightLeft,
    color: 'text-amber-500 bg-amber-50',
    label: 'изменил статус',
  },
  rename: { icon: Pencil, color: 'text-slate-500 bg-slate-50', label: 'переименовал' },
  change_deadline: { icon: Calendar, color: 'text-sky-500 bg-sky-50', label: 'изменил дедлайн' },
  // Анкеты
  fill_field: { icon: ClipboardEdit, color: 'text-teal-500 bg-teal-50', label: 'заполнил поле в' },
  update_field: { icon: ClipboardEdit, color: 'text-teal-500 bg-teal-50', label: 'обновил поле в' },
  // Прочее
  compress: { icon: Archive, color: 'text-cyan-500 bg-cyan-50', label: 'сжал' },
  merge: { icon: Merge, color: 'text-indigo-500 bg-indigo-50', label: 'объединил' },
  ai_check: { icon: Bot, color: 'text-purple-500 bg-purple-50', label: 'проверил через AI' },
}

const DEFAULT_CONFIG = { icon: Eye, color: 'text-gray-500 bg-gray-50', label: 'выполнил действие' }

// Маппинг resource_type → русское название
const RESOURCE_LABELS: Record<string, string> = {
  document: 'документ',
  document_kit: 'набор документов',
  folder: 'папку',
  project: 'проект',
  task: 'задачу',
  form_kit: 'анкету',
  project_participant: '',
}

function getResourceName(entry: AuditLogEntry, statusNames?: Map<string, string>): string {
  // Задачи хранят title вместо name
  const name = (entry.details?.name ?? entry.details?.title) as string | undefined
  // Анкеты: «поле X в анкете Y»
  const formKitName = entry.details?.form_kit_name as string | undefined
  const fieldLabel = entry.details?.field_label as string | undefined

  if (entry.action === 'fill_field' || entry.action === 'update_field') {
    const parts: string[] = []
    if (fieldLabel) parts.push(`«${fieldLabel}»`)
    if (formKitName) parts.push(`анкете «${formKitName}»`)
    return parts.join(' в ')
  }

  // Переименование: «Старое» → «Новое»
  if (entry.action === 'rename') {
    const oldName = entry.details?.old_name as string | undefined
    const newName = entry.details?.new_name as string | undefined
    if (oldName && newName) return `«${oldName}» → «${newName}»`
  }

  // Смена статуса: добавляем подробности — резолвим UUID статуса в имя,
  // fallback — урезанный id (на случай если статус удалили)
  if (entry.action === 'change_status') {
    const parts: string[] = []
    if (name) parts.push(`«${name}»`)
    const oldStatus = entry.details?.old_status as string | undefined
    const newStatus = entry.details?.new_status as string | undefined
    if (oldStatus || newStatus) {
      const resolve = (v?: string) => {
        if (!v) return '—'
        return statusNames?.get(v) ?? v.slice(0, 8)
      }
      parts.push(`(${resolve(oldStatus)} → ${resolve(newStatus)})`)
    }
    return parts.join(' ')
  }

  if (name) return `«${name}»`

  const count = entry.details?.count as number | undefined
  if (count) return `(${count} шт.)`

  return ''
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'только что'
  if (diffMin < 60) return `${diffMin} мин. назад`
  if (diffHour < 24) return `${diffHour} ч. назад`
  if (diffDay === 1) return 'вчера'
  if (diffDay < 7) return `${diffDay} дн. назад`

  return formatShortDate(dateStr)
}

export function ActivityItem({ entry, isUnread, statusNames }: ActivityItemProps) {
  const config = ACTION_CONFIG[entry.action] ?? DEFAULT_CONFIG
  const Icon = config.icon
  const resourceLabel = RESOURCE_LABELS[entry.resource_type] ?? entry.resource_type
  const resourceName = getResourceName(entry, statusNames)
  const actorName = entry.actor_name ?? entry.actor_email ?? 'Система'

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors',
        isUnread && 'bg-blue-50/50',
      )}
    >
      <div
        className={cn(
          'shrink-0 mt-0.5 w-8 h-8 rounded-full flex items-center justify-center',
          config.color,
        )}
      >
        <Icon className="w-4 h-4" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          <span className="font-medium">{actorName}</span>{' '}
          <span className="text-muted-foreground">
            {config.label} {resourceLabel} {resourceName}
          </span>
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {formatRelativeTime(entry.created_at)}
        </p>
      </div>

      {isUnread && <span className="shrink-0 mt-2 w-2 h-2 rounded-full bg-blue-500" />}
    </div>
  )
}

// Экспорт для фильтров
export const RESOURCE_TYPE_OPTIONS = [
  { value: 'document', label: 'Документы' },
  { value: 'document_kit', label: 'Наборы документов' },
  { value: 'folder', label: 'Папки' },
  { value: 'project_participant', label: 'Участники' },
  { value: 'task', label: 'Задачи' },
  { value: 'form_kit', label: 'Анкеты' },
]

export const ACTION_OPTIONS = [
  { value: 'create', label: 'Создание' },
  { value: 'delete', label: 'Удаление' },
  { value: 'soft_delete', label: 'В корзину' },
  { value: 'restore', label: 'Восстановление' },
  { value: 'change_status', label: 'Смена статуса' },
  { value: 'rename', label: 'Переименование' },
  { value: 'change_deadline', label: 'Дедлайн' },
  { value: 'download', label: 'Скачивание' },
  { value: 'export_to_drive', label: 'Экспорт на Google Drive' },
  { value: 'add_participant', label: 'Добавление участника' },
  { value: 'remove_participant', label: 'Удаление участника' },
  { value: 'fill_field', label: 'Заполнение анкеты' },
  { value: 'update_field', label: 'Изменение анкеты' },
  { value: 'ai_check', label: 'AI-проверка' },
]
