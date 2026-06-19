"use client"

/**
 * Селектор видимости сообщения (Фаза 2). Компактный: в тулбаре показывает
 * ТОЛЬКО текущий режим (чип в его цвете), остальные варианты всплывают над
 * ним при наведении — не занимает отдельную полосу.
 *
 * Шкала охвата: Клиенту → Команде → Заметка → Только я. Цвет чипа = цвет
 * будущего бабла (палитра = аудитория), виден до отправки.
 */
import { useState } from 'react'
import { Send, Bell, BellOff, Lock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ComposerMode = 'client' | 'team' | 'note' | 'self'

/** Режим → что писать в сообщение (visibility + тихо/громко). */
export const MODE_VISIBILITY: Record<
  ComposerMode,
  { visibility: 'client' | 'team' | 'self'; notifySubscribers: boolean }
> = {
  client: { visibility: 'client', notifySubscribers: true },
  team: { visibility: 'team', notifySubscribers: true },
  note: { visibility: 'team', notifySubscribers: false },
  self: { visibility: 'self', notifySubscribers: false },
}

const MODES: {
  key: ComposerMode
  label: string
  Icon: LucideIcon
  active: string
  border: string
  title: string
}[] = [
  {
    key: 'client', label: 'Клиенту', Icon: Send,
    active: 'bg-blue-100 text-blue-800', border: 'border-blue-300',
    title: 'Клиент + команда · уходит в Telegram/email',
  },
  {
    key: 'team', label: 'Команде', Icon: Bell,
    active: 'bg-neutral-700 text-white', border: 'border-neutral-700',
    title: 'Только команда · уведомляет подписчиков',
  },
  {
    key: 'note', label: 'Заметка', Icon: BellOff,
    active: 'bg-neutral-400 text-white', border: 'border-neutral-400',
    title: 'Только команда · тихо (лишь @теги)',
  },
  {
    key: 'self', label: 'Только я', Icon: Lock,
    active: 'bg-amber-100 text-amber-800', border: 'border-amber-300',
    title: 'Вижу только я · никого не уведомляет',
  },
]

export function ComposerVisibilitySwitch({
  mode,
  onChange,
}: {
  mode: ComposerMode
  onChange: (mode: ComposerMode) => void
}) {
  const [open, setOpen] = useState(false)
  const current = MODES.find((m) => m.key === mode) ?? MODES[0]
  const CurrentIcon = current.Icon

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Всплывающая панель со всеми вариантами — над чипом, без сдвига layout.
          Внешний div — прозрачный «мостик» (pb-1.5), чтобы курсор не выпадал из
          hover-зоны в зазоре между чипом и панелью. */}
      {open && (
        <div className="absolute bottom-full right-0 pb-1.5 z-30">
          <div className="flex items-center rounded-full border border-border bg-popover shadow-md overflow-hidden">
            {MODES.map((m, i) => {
              const isActive = m.key === mode
              const Icon = m.Icon
              return (
                <button
                  key={m.key}
                  type="button"
                  title={m.title}
                  onClick={() => {
                    onChange(m.key)
                    setOpen(false)
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 text-[11px] px-2.5 py-1 transition-colors cursor-pointer whitespace-nowrap',
                    i > 0 && 'border-l border-border',
                    isActive ? m.active : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {m.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Текущий режим — компактный чип в его цвете. */}
      <button
        type="button"
        title={current.title}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border transition-colors cursor-pointer whitespace-nowrap',
          current.active,
          current.border,
        )}
      >
        <CurrentIcon className="h-3 w-3" />
        {current.label}
      </button>
    </div>
  )
}
