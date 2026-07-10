import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Лёгкая плашка-подпись для коротких статусов. Единый стиль везде — меняя здесь,
 * меняешь во всех местах.
 *   - `muted` (по умолчанию) — серый: «пусто»/«нет документов».
 *   - `accent` — фирменный (как бейдж фильтра «Все задачи»): когда элементы есть,
 *     напр. «N задач» у свёрнутой группы.
 */
export function MutedPill({
  children,
  variant = 'muted',
  className,
}: {
  children: ReactNode
  variant?: 'muted' | 'accent'
  className?: string
}) {
  return (
    <span
      className={cn(
        'shrink-0 text-[11px] rounded px-1.5 py-0.5',
        variant === 'accent'
          ? 'bg-brand-100 text-brand-600 font-medium'
          : 'bg-gray-100 text-gray-400 font-normal',
        className,
      )}
    >
      {children}
    </span>
  )
}
