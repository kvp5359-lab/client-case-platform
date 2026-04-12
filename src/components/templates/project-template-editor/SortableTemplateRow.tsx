/**
 * SortableTemplateRow — строка шаблона треда с drag-and-drop (dnd-kit).
 * Извлечён из ProjectTemplateThreadList для уменьшения размера файла.
 */

"use client"

import { createElement } from 'react'
import Image from 'next/image'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Button } from '@/components/ui/button'
import { Pencil, Trash2, Copy, Clock, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChatIconComponent } from '@/components/messenger/ChatSettingsDialog'
import { COLOR_TEXT } from '@/components/messenger/threadConstants'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { ThreadTemplate } from '@/types/threadTemplate'

export interface SortableRowProps {
  template: ThreadTemplate
  status: { name: string; color: string } | undefined
  assigneeRows: Array<{
    id: string
    name: string
    last_name: string | null
    avatar_url: string | null
  }>
  onEdit: (t: ThreadTemplate) => void
  onCopy: (t: ThreadTemplate) => void
  onDelete: (id: string) => void
}

export function SortableTemplateRow({
  template: t,
  status,
  assigneeRows,
  onEdit,
  onCopy,
  onDelete,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: t.id,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    zIndex: isDragging ? 10 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 rounded group hover:bg-muted/60 transition-colors py-1"
    >
      {/* Drag handle — grip-иконка слева, видна только при hover. */}
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none p-0.5 -m-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        aria-label="Переупорядочить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {/* Иконка шаблона без подложки — просто lucide-иконка соответствующего
          цвета (accent_color). Если цвет не знаем — fallback на text-blue-500. */}
      {createElement(getChatIconComponent(t.icon), {
        className: cn(
          'w-4 h-4 flex-shrink-0',
          COLOR_TEXT[t.accent_color] ?? 'text-blue-500',
        ),
      })}
      <span className="text-sm truncate flex-shrink min-w-0">{t.name}</span>
      {t.description && (
        <span className="text-xs text-muted-foreground truncate flex-shrink min-w-0">
          — {t.description}
        </span>
      )}
      {/* Превью метаданных шаблона (только для задач): статус, дедлайн,
          исполнители. НЕ скрывается при hover. */}
      {t.thread_type === 'task' && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {status && (
            <span
              className="text-xs font-medium"
              style={{ color: safeCssColor(status.color) }}
              title={`Статус: ${status.name}`}
            >
              {status.name}
            </span>
          )}
          {t.deadline_days != null && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground"
              title={`Дедлайн через ${t.deadline_days} дн.`}
            >
              <Clock className="w-3 h-3" />
              {t.deadline_days} дн.
            </span>
          )}
          {assigneeRows.length > 0 && (
            <div className="flex -space-x-1.5">
              {assigneeRows.slice(0, 3).map((p) => {
                const initial = (p.name ?? '').charAt(0).toUpperCase() || '?'
                const fullName = p.last_name ? `${p.name} ${p.last_name}` : p.name
                return p.avatar_url ? (
                  <Image
                    key={p.id}
                    src={p.avatar_url}
                    alt={fullName}
                    title={fullName}
                    width={20}
                    height={20}
                    className="w-5 h-5 rounded-full object-cover ring-2 ring-background"
                  />
                ) : (
                  <div
                    key={p.id}
                    title={fullName}
                    className="w-5 h-5 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-background"
                  >
                    {initial}
                  </div>
                )
              })}
              {assigneeRows.length > 3 && (
                <div
                  title={assigneeRows
                    .slice(3)
                    .map((p) => (p.last_name ? `${p.name} ${p.last_name}` : p.name))
                    .join(', ')}
                  className="w-5 h-5 rounded-full bg-muted text-[10px] font-medium flex items-center justify-center ring-2 ring-background"
                >
                  +{assigneeRows.length - 3}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onEdit(t)}
          title="Редактировать"
        >
          <Pencil className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => onCopy(t)}
          title="Копировать"
        >
          <Copy className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={() => onDelete(t.id)}
          title="Удалить"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}
