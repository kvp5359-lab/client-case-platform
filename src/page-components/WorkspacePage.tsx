/**
 * WorkspacePage — основная рабочая страница пространства (для пользователя)
 *
 * Содержит:
 * - Header (верхняя панель)
 * - Sidebar (боковая панель)
 * - Контент рабочего пространства
 */

import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useWorkspaceStore } from '@/store/workspaceStore'

export function WorkspacePage() {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const loading = useWorkspaceStore((s) => s.loading)
  const error = useWorkspaceStore((s) => s.error)

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        {loading ? (
          <p className="text-gray-500 text-lg">Загрузка...</p>
        ) : error ? (
          <p className="text-red-500 text-lg">{error}</p>
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
