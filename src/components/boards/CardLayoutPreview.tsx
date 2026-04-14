"use client"

import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CardLayout, CardFieldId, CardFieldStyle } from './types'
import { resolveCardLayout, fieldStyleToClasses } from './cardLayoutUtils'

interface CardLayoutPreviewProps {
  layout: CardLayout
  entityType: 'task' | 'project'
  columnWidth?: number
}

/** Фейковые данные для превью */
const MOCK: Record<CardFieldId, React.ReactNode> = {
  status: <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />,
  icon: <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
  name: 'Пример записи для превью',
  deadline: '15 апр',
  assignees: (
    <div className="flex -space-x-1 shrink-0">
      <div className="h-5 w-5 rounded-full bg-blue-200 border-2 border-background" />
      <div className="h-5 w-5 rounded-full bg-green-200 border-2 border-background" />
    </div>
  ),
  project: 'Мой проект',
  template: 'Бизнес-план',
  unread: <div className="h-2 w-2 rounded-full bg-primary shrink-0" />,
}

function PreviewField({ fieldId, style }: { fieldId: CardFieldId; style: CardFieldStyle }) {
  const content = MOCK[fieldId]
  if (!content) return null

  // Для компонентных полей (status, icon, assignees, unread) не применяем текстовые стили
  const isComponent = ['status', 'icon', 'assignees', 'unread'].includes(fieldId)

  if (isComponent) {
    const alignClass =
      style.align === 'right' ? 'ml-auto' : style.align === 'center' ? 'mx-auto' : ''
    return <span className={cn('shrink-0', alignClass)}>{content}</span>
  }

  const classes = fieldStyleToClasses(style)
  const isName = fieldId === 'name'

  return (
    <span
      className={cn(
        classes,
        isName ? 'min-w-0 flex-1' : 'shrink-0',
        fieldId === 'deadline' && 'text-muted-foreground',
        fieldId === 'project' && 'text-muted-foreground',
        fieldId === 'template' && 'text-muted-foreground/60',
      )}
    >
      {content}
    </span>
  )
}

export function CardLayoutPreview({ layout, entityType, columnWidth }: CardLayoutPreviewProps) {
  const resolved = resolveCardLayout(layout, entityType)

  if (!resolved) {
    return (
      <div className="text-xs text-muted-foreground italic p-3">
        Нет видимых полей
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground font-medium">Превью</p>
      <div
        className="rounded-md border bg-background px-2.5 py-1.5 space-y-0.5"
        style={columnWidth ? { maxWidth: `${columnWidth}px` } : undefined}
      >
        {resolved.map((row, i) => (
          <div key={i} className="flex items-center gap-1.5 min-w-0">
            {row.fields.map((f) => (
              <PreviewField key={f.fieldId} fieldId={f.fieldId} style={f.style} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
