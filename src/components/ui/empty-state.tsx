import { PageLoader } from './loaders'

export function EmptyState({
  loading,
  emptyText = 'Нет данных',
}: {
  loading?: boolean
  emptyText?: string
}) {
  if (loading) return <PageLoader />
  return <div className="text-center py-8 text-gray-500">{emptyText}</div>
}
