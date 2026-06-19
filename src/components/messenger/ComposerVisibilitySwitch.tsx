"use client"

/**
 * Переключатель видимости сообщения над композером (Фаза 2).
 * Одна шкала охвата от широкого к узкому: Клиенту → Команде → Заметка → Только я.
 *
 * Цвет акцента каждого режима совпадает с цветом будущего бабла (палитра =
 * аудитория): client=акцент, team/note=нейтраль, self=жёлтый. Это видно ДО
 * нажатия — защита от случайной отправки клиенту.
 */
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

const MODES: { key: ComposerMode; label: string; accent: string; title: string }[] = [
  { key: 'client', label: 'Клиенту', accent: 'bg-blue-600', title: 'Клиент + команда · уходит в Telegram/email' },
  { key: 'team', label: 'Команде', accent: 'bg-neutral-800', title: 'Только команда · уведомляет подписчиков' },
  { key: 'note', label: 'Заметка', accent: 'bg-neutral-400', title: 'Только команда · тихо (лишь @теги)' },
  { key: 'self', label: 'Только я', accent: 'bg-amber-400', title: 'Вижу только я · никого не уведомляет' },
]

export function ComposerVisibilitySwitch({
  mode,
  onChange,
}: {
  mode: ComposerMode
  onChange: (mode: ComposerMode) => void
}) {
  return (
    <div className="flex items-stretch rounded-lg border border-border overflow-hidden text-xs font-medium select-none">
      {MODES.map((m) => {
        const active = m.key === mode
        return (
          <button
            key={m.key}
            type="button"
            title={m.title}
            onClick={() => onChange(m.key)}
            className={cn(
              'flex-1 px-2 py-1.5 border-b-2 transition-colors',
              active
                ? cn('text-foreground', m.accent.replace('bg-', 'border-'))
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', active ? m.accent : 'bg-muted-foreground/40')} />
              {m.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
