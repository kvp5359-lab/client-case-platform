import { cn } from '@/lib/utils'
import { PageLoader } from './loaders'

export function EmptyState({
  loading,
  emptyText = 'Нет данных',
  bordered,
}: {
  loading?: boolean
  emptyText?: string
  /** Обвести пунктирной рамкой — аккуратный пустой блок вместо «висящего» текста. */
  bordered?: boolean
}) {
  if (loading) return <PageLoader />
  return (
    <div
      className={cn(
        'text-center py-8 text-gray-500',
        bordered && 'rounded-lg border border-dashed border-border bg-muted/20',
      )}
    >
      {emptyText}
    </div>
  )
}
