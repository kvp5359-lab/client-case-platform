/**
 * WorkspacePage — основная рабочая страница пространства (для пользователя)
 *
 * Содержит:
 * - Header (верхняя панель)
 * - Sidebar (боковая панель)
 * - Контент рабочего пространства
 */

import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'

export function WorkspacePage() {
  const { workspace, isLoading, error } = useWorkspaceContext()

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        {isLoading ? (
          <p className="text-gray-500 text-lg">Загрузка...</p>
        ) : error ? (
          <p className="text-red-500 text-lg">{error.message}</p>
        ) : workspace ? (
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">{workspace.name}</h1>
            <p className="text-gray-600">Добро пожаловать в рабочее пространство</p>
          </div>
        ) : (
          <p className="text-gray-500 text-lg">Рабочее пространство не найдено</p>
        )}
      </main>
    </WorkspaceLayout>
  )
}
