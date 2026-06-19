"use client"

/**
 * Селектор видимости сообщения (Фаза 2). Компактный inline: выбранный режим
 * показан иконкой + текстом в его цвете, остальные три — только иконками.
 * Любой кликабелен. Цвет = цвет будущего бабла (палитра = аудитория).
 *
 * Шкала охвата: Клиенту → Команде → Заметка → Только я.
 */
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
  const activeBorder = MODES.find((m) => m.key === mode)?.border ?? 'border-border'

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border overflow-hidden bg-background shadow-sm',
        activeBorder,
      )}
    >
      {MODES.map((m, i) => {
        const isActive = m.key === mode
        const Icon = m.Icon
        return (
          <button
            key={m.key}
            type="button"
            title={m.title}
            onClick={() => onChange(m.key)}
            className={cn(
              'inline-flex items-center gap-1 text-[11px] py-0.5 transition-colors cursor-pointer whitespace-nowrap',
              isActive ? cn('px-2', m.active) : 'px-1.5 text-muted-foreground hover:bg-muted',
              i > 0 && 'border-l border-border',
            )}
          >
            <Icon className="h-3 w-3 shrink-0" />
            {isActive && m.label}
          </button>
        )
      })}
    </div>
  )
}
