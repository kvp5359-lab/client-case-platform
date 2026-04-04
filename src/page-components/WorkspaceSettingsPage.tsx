/**
 * Workspace Settings Page — настройки рабочего пространства с вкладками
 * Тяжёлые табы загружаются лениво через React.lazy (Z5-23)
 */

import React, { Suspense } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeneralSettingsTab } from './workspace-settings/GeneralSettingsTab'

const ParticipantsTab = React.lazy(() =>
  import('./workspace-settings/ParticipantsTab').then((m) => ({ default: m.ParticipantsTab })),
)
const PermissionsTab = React.lazy(() =>
  import('./workspace-settings/PermissionsTab').then((m) => ({ default: m.PermissionsTab })),
)
const DirectoriesTab = React.lazy(() =>
  import('./workspace-settings/DirectoriesTab').then((m) => ({ default: m.DirectoriesTab })),
)
const TemplatesTab = React.lazy(() =>
  import('./workspace-settings/TemplatesTab').then((m) => ({ default: m.TemplatesTab })),
)

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const pathname = usePathname()

  // Определяем активный таб по URL
  const getActiveTab = () => {
    const path = pathname.split('/').pop()
    return path || 'general'
  }

  const handleTabChange = (tab: string) => {
    router.push(`/workspaces/${workspaceId}/settings/${tab}`)
  }

  const activeTab = getActiveTab()

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* Page Title */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Настройки рабочего пространства</h1>
            <p className="text-gray-600 mt-1">
              Управление настройками и конфигурацией рабочего пространства
            </p>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} className="w-full">
            <TabsList>
              <TabsTrigger value="general" onClick={() => handleTabChange('general')}>
                Настройки
              </TabsTrigger>
              <TabsTrigger value="participants" onClick={() => handleTabChange('participants')}>
                Участники
              </TabsTrigger>
              <TabsTrigger value="permissions" onClick={() => handleTabChange('permissions')}>
                Права доступа
              </TabsTrigger>
              <TabsTrigger
                value="directories"
                onClick={() => handleTabChange('directories')}
                data-state={pathname.includes('/directories/') ? 'active' : 'inactive'}
              >
                Справочники
              </TabsTrigger>
              <TabsTrigger
                value="templates"
                onClick={() => handleTabChange('templates')}
                data-state={pathname.includes('/templates/') ? 'active' : 'inactive'}
              >
                Шаблоны
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Routes */}
          <Suspense fallback={<div className="p-4">Загрузка...</div>}>
            <Routes>
              <Route path="/" element={<Navigate to="general" replace />} />
              <Route path="/general" element={<GeneralSettingsTab />} />
              <Route path="/participants" element={<ParticipantsTab />} />
              <Route path="/permissions" element={<PermissionsTab />} />
              <Route path="/directories/*" element={<DirectoriesTab />} />
              <Route path="/templates/*" element={<TemplatesTab />} />
            </Routes>
          </Suspense>
        </div>
      </main>
    </WorkspaceLayout>
  )
}
