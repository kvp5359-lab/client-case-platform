/**
 * Стандартные плейсхолдеры загрузки.
 *
 * Используй вместо ad-hoc «Загрузка...» / inline Loader2.
 * Конкретные сценарии:
 *  - PageLoader — полноэкранный/панельный спиннер (вкладки, страницы, тяжёлый Suspense)
 *  - InlineLoader — маленький спиннер в строке (рядом с кнопкой/полем)
 *  - RowsSkeleton — псевдо-строки списка (списки, таблицы, секции)
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/** Спиннер на всю доступную область с опциональным текстом. */
export function PageLoader({
  label,
  className,
}: {
  label?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center gap-2 py-8 text-muted-foreground',
        className,
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}

/** Маленький встроенный спиннер. Размер по дефолту 16px (h-4 w-4). */
export function InlineLoader({
  className,
  size = 'sm',
}: {
  className?: string
  size?: 'sm' | 'md'
}) {
  return (
    <Loader2
      className={cn(
        'animate-spin text-muted-foreground',
        size === 'sm' ? 'h-4 w-4' : 'h-5 w-5',
        className,
      )}
    />
  )
}

/** Несколько строк скелетона списка. */
export function RowsSkeleton({
  count = 4,
  className,
  rowClassName,
}: {
  count?: number
  className?: string
  rowClassName?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn('h-10 w-full', rowClassName)} />
      ))}
    </div>
  )
}
