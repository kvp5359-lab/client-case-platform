/**
 * PageHeader — типовой заголовок страницы: ← Назад · Title · Actions.
 *
 * Используй на страницах-редакторах и детальных вьюхах, где есть
 * возврат к списку. Для страниц «обзорных» (taskы, проекты, доски) —
 * обычно достаточно прямого H1, тогда не нужно.
 */

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

type PageHeaderProps = {
  title: ReactNode
  /** Подзаголовок под title (например, тип сущности или хлебные крошки). */
  subtitle?: ReactNode
  /** Слот с кнопками/действиями справа от заголовка. */
  actions?: ReactNode
  /**
   * Кастомный обработчик кнопки «Назад». По умолчанию — router.back().
   * Передай чтобы открыть конкретный URL (например, всегда возвращать к списку,
   * а не к предыдущей странице из истории).
   */
  onBack?: () => void
  /** Скрыть кнопку «Назад» — для верхнеуровневых разделов без родителя. */
  hideBack?: boolean
  /** Тонкая полоска снизу под заголовком. По умолчанию есть. */
  bordered?: boolean
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  actions,
  onBack,
  hideBack = false,
  bordered = true,
  className,
}: PageHeaderProps) {
  const router = useRouter()
  const handleBack = onBack ?? (() => router.back())

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 px-6 py-4',
        bordered && 'border-b',
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {!hideBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            aria-label="Назад"
            className="shrink-0 -ml-2"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          {typeof title === 'string' ? (
            <h1 className="text-xl font-semibold truncate">{title}</h1>
          ) : (
            title
          )}
          {subtitle && (
            <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
