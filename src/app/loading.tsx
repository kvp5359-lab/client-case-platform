export default function Loading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center p-6">
      <div className="flex items-center gap-3 text-gray-500">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        <span className="text-sm">Загрузка...</span>
      </div>
    </div>
  )
}
