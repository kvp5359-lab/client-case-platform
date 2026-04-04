/**
 * DirectoriesTab - вкладка управления справочниками
 */

import { useParams, useRouter, usePathname } from 'next/navigation'
import { StatusesDirectory } from '@/components/directories/StatusesDirectory'
import {
  WorkspaceRolesDirectory,
  ProjectRolesDirectory,
} from '@/components/directories/RolesDirectory'
import { QuickRepliesDirectory } from '@/components/directories/QuickRepliesDirectory'
import {
  CustomDirectoriesList,
  CustomDirectoryPage,
} from '@/components/directories/custom-directories'

type DirectorySection =
  | 'statuses' // Статусы (для разных сущностей)
  | 'workspace-roles' // Роли workspace
  | 'project-roles' // Роли проекта
  | 'quick-replies' // Быстрые ответы
  | 'custom' // Пользовательские справочники

export function DirectoriesTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const pathname = usePathname()

  // Определяем активную секцию по URL
  const getActiveSection = (): DirectorySection => {
    const pathParts = pathname.split('/')
    const directoriesIdx = pathParts.indexOf('directories')
    const section = directoriesIdx >= 0 ? pathParts[directoriesIdx + 1] : undefined
    if (section === 'workspace-roles' || section === 'project-roles') return section
    if (section === 'quick-replies') return section
    if (section === 'custom') return 'custom'
    return 'statuses'
  }

  const activeSection = getActiveSection()

  const menuItems = [
    {
      id: 'statuses' as const,
      label: 'Статусы',
    },
    {
      id: 'workspace-roles' as const,
      label: 'Роли workspace',
    },
    {
      id: 'project-roles' as const,
      label: 'Роли проекта',
    },
    {
      id: 'quick-replies' as const,
      label: 'Быстрые ответы',
    },
    {
      id: 'custom' as const,
      label: 'Справочники',
    },
  ]

  const handleSectionChange = (section: DirectorySection) => {
    router.push(`/workspaces/${workspaceId}/settings/directories/${section}`)
  }

  const renderMenuItem = (item: (typeof menuItems)[0]) => (
    <button
      key={item.id}
      onClick={() => handleSectionChange(item.id)}
      className={`
        w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors
        ${
          activeSection === item.id
            ? 'bg-amber-100 text-amber-900 font-medium'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }
      `}
    >
      {item.label}
    </button>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Справочники</h2>
        <p className="text-gray-600">Управление справочниками и настройками</p>
      </div>

      <div className="flex bg-white rounded-lg border min-h-[500px]">
        {/* Боковая навигация */}
        <aside className="w-56 border-r bg-white p-3 flex-shrink-0">
          <nav className="space-y-1">
            {/* Секция СТАТУСЫ */}
            <div>
              <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Статусы
              </p>
              <div className="space-y-0.5 pl-2">{renderMenuItem(menuItems[0])}</div>
            </div>

            {/* Секция РОЛИ */}
            <div className="pt-4">
              <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Роли
              </p>
              <div className="space-y-0.5 pl-2">
                {renderMenuItem(menuItems[1])}
                {renderMenuItem(menuItems[2])}
              </div>
            </div>

            {/* Секция ШАБЛОНЫ */}
            <div className="pt-4">
              <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Шаблоны
              </p>
              <div className="space-y-0.5 pl-2">{renderMenuItem(menuItems[3])}</div>
            </div>

            {/* Секция СПРАВОЧНИКИ */}
            <div className="pt-4">
              <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-wider text-gray-400">
                Данные
              </p>
              <div className="space-y-0.5 pl-2">{renderMenuItem(menuItems[4])}</div>
            </div>
          </nav>
        </aside>

        {/* Контент */}
        <div className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Navigate to="statuses" replace />} />
            <Route path="/statuses" element={<StatusesDirectory />} />
            <Route path="/workspace-roles" element={<WorkspaceRolesDirectory />} />
            <Route path="/project-roles" element={<ProjectRolesDirectory />} />
            <Route path="/quick-replies" element={<QuickRepliesDirectory />} />
            <Route path="/custom" element={<CustomDirectoriesList />} />
            <Route path="/custom/:directoryId" element={<CustomDirectoryPage />} />
          </Routes>
        </div>
      </div>
    </div>
  )
}
