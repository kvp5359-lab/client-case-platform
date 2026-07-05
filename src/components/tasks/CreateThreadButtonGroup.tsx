"use client"

/**
 * CreateThreadButtonGroup — split-кнопка «+ Создать задачу» + chevron-popover.
 *
 * Левая часть — быстрая кнопка, делает основной action (по умолчанию «задача»).
 * Правая часть — chevron, открывает popover с:
 *   • альтернативные типы (Задача / Чат / Email)
 *   • Шаблоны тредов проекта
 *
 * Используется в TaskListView (страница «Задачи» проекта) вместо одиночной
 * кнопки «Создать задачу». Триггерит ChatSettingsDialog с правильными
 * defaultThreadType + initialTemplate.
 */

import { useState } from 'react'
import { ChevronDown, MessageSquare, CheckSquare, Mail, FolderPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import type { ThreadTemplate } from '@/types/threadTemplate'

export type ThreadKind = 'task' | 'chat' | 'email'

type Props = {
  threadTemplates: ThreadTemplate[]
  onCreate: (kind: ThreadKind, template?: ThreadTemplate) => void
  /** Создать группу задач в плане проекта (только в проекте). */
  onCreateGroup?: () => void
  /** Тип action'а при клике на основную кнопку. По умолчанию 'task'. */
  primary?: ThreadKind
  className?: string
}

const TYPE_LABELS: Record<ThreadKind, { label: string; icon: typeof CheckSquare }> = {
  task: { label: 'Задача', icon: CheckSquare },
  chat: { label: 'Чат', icon: MessageSquare },
  email: { label: 'Email', icon: Mail },
}

const ACCENT_TEXT: Record<string, string> = {
  blue: 'text-blue-500',
  slate: 'text-stone-600',
  emerald: 'text-emerald-600',
  amber: 'text-amber-500',
  rose: 'text-red-500',
  violet: 'text-violet-600',
  orange: 'text-orange-500',
  cyan: 'text-cyan-600',
  pink: 'text-pink-500',
  indigo: 'text-indigo-600',
}

export function CreateThreadButtonGroup({
  threadTemplates,
  onCreate,
  onCreateGroup,
  primary = 'task',
  className,
}: Props) {
  const [open, setOpen] = useState(false)
  const primaryMeta = TYPE_LABELS[primary]
  const PrimaryIcon = primaryMeta.icon

  return (
    <div className={cn('flex shrink-0', className)}>
      <Button
        size="sm"
        variant="outline"
        className="h-9 rounded-r-none border-r-0"
        onClick={() => onCreate(primary)}
      >
        <PrimaryIcon className="w-4 h-4 mr-1.5" />
        Создать
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-9 rounded-l-none px-2"
            aria-label="Больше вариантов"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-1 max-h-[min(70vh,28rem)] overflow-y-auto"
          align="end"
          sideOffset={6}
        >
          {/* Группа задач (плана проекта) — вверху списка */}
          {onCreateGroup && (
            <>
              <button
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1 rounded text-sm hover:bg-muted text-left"
                onClick={() => {
                  setOpen(false)
                  onCreateGroup()
                }}
              >
                <FolderPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                Группа
              </button>
              <div className="border-t my-1" />
            </>
          )}

          {/* Типы тредов */}
          {(['task', 'chat', 'email'] as ThreadKind[]).map((k) => {
            const m = TYPE_LABELS[k]
            const I = m.icon
            return (
              <button
                key={k}
                type="button"
                className="flex items-center gap-2 w-full px-2 py-1 rounded text-sm hover:bg-muted text-left"
                onClick={() => {
                  setOpen(false)
                  onCreate(k)
                }}
              >
                <I className="w-4 h-4 text-muted-foreground shrink-0" />
                {m.label}
              </button>
            )
          })}

          {threadTemplates.length > 0 && (
            <>
              <div className="border-t my-1" />
              <p className="text-[11px] font-medium uppercase text-muted-foreground px-2 py-1">
                Шаблоны
              </p>
              {threadTemplates.map((t) => {
                const IconComp = getChatIconComponent(t.icon)
                const kind: ThreadKind = t.is_email
                  ? 'email'
                  : t.thread_type === 'task'
                    ? 'task'
                    : 'chat'
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="flex items-center gap-2 w-full px-2 py-1 rounded text-sm hover:bg-muted text-left"
                    onClick={() => {
                      setOpen(false)
                      onCreate(kind, t)
                    }}
                  >
                    <IconComp
                      className={cn(
                        'w-4 h-4 shrink-0',
                        ACCENT_TEXT[t.accent_color ?? ''] ?? 'text-muted-foreground',
                      )}
                    />
                    <span className="truncate">{t.name}</span>
                  </button>
                )
              })}
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
