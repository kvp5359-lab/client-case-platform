import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">
        Страница не найдена
      </h2>
      <p className="text-sm text-gray-600 mb-6 max-w-md">
        Запрошенный адрес не существует или был удалён
      </p>
      <Link
        href="/"
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
      >
        На главную
      </Link>
    </div>
  )
}
