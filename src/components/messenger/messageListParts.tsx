/**
 * Презентационные части ленты сообщений (разделители дат/непрочитанного) +
 * чистые date-хелперы. Вынесено из MessageList.tsx (аудит 2026-07-13) —
 * логика не менялась.
 */
import { cn } from '@/lib/utils'

/** Метка дня: «Сегодня» / «Вчера» / «5 июня 2026». Общая для инлайн-разделителя
 *  и плавающего бейджа даты. */
export function formatDayLabel(date: string): string {
  const d = new Date(date)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Разделитель дат. */
export function DateSeparator({ date }: { date: string }) {
  // data-sep-day — маркер для плавающего бейджа: по разделителям (их мало, по
  // одному на день) дёшево определяем текущий день при скролле.
  return (
    <div className="flex justify-center py-3" data-sep-day={formatDayLabel(date)}>
      <span className="text-xs text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
        {formatDayLabel(date)}
      </span>
    </div>
  )
}

/** Разделитель непрочитанных. */
export function UnreadSeparator({ tone = 'red' }: { tone?: 'red' | 'slate' }) {
  const line = tone === 'slate' ? 'border-slate-400' : 'border-red-400'
  const text = tone === 'slate' ? 'text-slate-500' : 'text-red-500'
  return (
    <div className="flex items-center gap-3 py-2">
      <div className={cn('flex-1 border-t', line)} />
      <span className={cn('text-xs font-medium', text)}>Непрочитанные</span>
      <div className={cn('flex-1 border-t', line)} />
    </div>
  )
}

export function isSameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
