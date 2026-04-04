export function EmptyState({
  loading,
  emptyText = 'Нет данных',
}: {
  loading?: boolean
  emptyText?: string
}) {
  if (loading) return <div className="text-center py-8 text-gray-500">Загрузка...</div>
  return <div className="text-center py-8 text-gray-500">{emptyText}</div>
}
