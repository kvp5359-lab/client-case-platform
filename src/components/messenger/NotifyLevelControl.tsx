"use client"

/**
 * Выбор уровня уведомлений по треду: «Все» / «Только сообщения» / «Выключены».
 * Общий для колокольчика в шапке, пункта меню «⋮» и настроек треда — чтобы все
 * точки управления подпиской вели себя одинаково.
 */
import { Bell, BellMinus, BellOff, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotifyLevel } from '@/hooks/messenger/useThreadSubscription'

export const NOTIFY_LEVELS: {
  value: NotifyLevel
  label: string
  desc: string
  Icon: typeof Bell
}[] = [
  { value: 'all', label: 'Все', desc: 'Сообщения и статусы/сроки', Icon: Bell },
  { value: 'messages', label: 'Только сообщения', desc: 'Без статусов и сроков', Icon: BellMinus },
  { value: 'off', label: 'Выключены', desc: 'Тишина — тред в «Заглушённые»', Icon: BellOff },
]

/** Иконка текущего уровня (для колокольчика в шапке / триггеров). Цвет наследуется. */
export function NotifyLevelIcon({ level, className }: { level: NotifyLevel; className?: string }) {
  switch (level) {
    case 'off':
      return <BellOff className={className} />
    case 'messages':
      return <BellMinus className={className} />
    default:
      return <Bell className={className} />
  }
}

/**
 * Список из трёх вариантов с галочкой у текущего. Кладётся внутрь Popover
 * (шапка/настройки). Для меню «⋮» используется отдельная разметка Radix-submenu.
 */
export function NotifyLevelOptions({
  level,
  onSelect,
  pending = false,
}: {
  level: NotifyLevel | null
  onSelect: (level: NotifyLevel) => void
  pending?: boolean
}) {
  return (
    <div className="py-1">
      {NOTIFY_LEVELS.map(({ value, label, desc, Icon }) => {
        const active = level === value
        return (
          <button
            key={value}
            type="button"
            disabled={pending}
            onClick={() => onSelect(value)}
            className={cn(
              'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors disabled:opacity-50',
              active ? 'bg-muted/60' : 'hover:bg-muted/50',
            )}
          >
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', value === 'off' ? 'text-amber-500' : 'text-muted-foreground')} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm leading-tight">{label}</span>
              <span className="block text-[11px] text-muted-foreground leading-tight">{desc}</span>
            </span>
            {active && <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-foreground" />}
          </button>
        )
      })}
    </div>
  )
}
