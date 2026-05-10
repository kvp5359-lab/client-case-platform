"use client"

/**
 * Workspace Settings Page — настройки рабочего пространства с вкладками
 * Тяжёлые табы загружаются лениво через React.lazy
 */

import React, { Suspense, useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GeneralSettingsTab } from './workspace-settings/GeneralSettingsTab'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'

const SETTINGS_TAB_TITLES: Record<string, string> = {
  general: 'Настройки',
  participants: 'Участники',
  permissions: 'Права',
  directories: 'Справочники',
  templates: 'Шаблоны',
  integrations: 'Интеграции',
  digest: 'Дневник проекта',
  sidebar: 'Сайдбар',
  domain: 'Домен',
  trash: 'Корзина',
}

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
const TrashTab = React.lazy(() =>
  import('./workspace-settings/TrashTab').then((m) => ({ default: m.TrashTab })),
)
const DigestSettingsTab = React.lazy(() =>
  import('./workspace-settings/DigestSettingsTab').then((m) => ({ default: m.DigestSettingsTab })),
)
const SidebarSettingsTab = React.lazy(() =>
  import('./workspace-settings/SidebarSettingsTab').then((m) => ({ default: m.SidebarSettingsTab })),
)
const IntegrationsTab = React.lazy(() =>
  import('./workspace-settings/IntegrationsTab').then((m) => ({ default: m.IntegrationsTab })),
)
const DomainSettingsTab = React.lazy(() =>
  import('./workspace-settings/DomainSettingsTab').then((m) => ({ default: m.DomainSettingsTab })),
)

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  const pathname = usePathname()
  const permissions = useWorkspacePermissions({ workspaceId: workspaceId || '' })

  const canManageParticipants =
    permissions.isOwner || permissions.can('manage_participants')
  const canManageRoles = permissions.isOwner || permissions.can('manage_roles')
  const canManageTemplates =
    permissions.isOwner || permissions.can('manage_templates')
  const canManageSettings =
    permissions.isOwner || permissions.can('manage_workspace_settings')

  // Право заходить в раздел настроек хоть на какую-то вкладку
  const hasAnySettingsAccess =
    canManageSettings ||
    canManageParticipants ||
    canManageRoles ||
    canManageTemplates

  // Закрываем основную правую панель: настройки — полноценная страница,
  // содержимое шире, правая панель перекрывает контент.
  const closePanel = useSidePanelStore((s) => s.closePanel)
  useEffect(() => {
    closePanel()
  }, [closePanel])

  // Определяем активный таб по URL
  const getActiveTab = () => {
    if (pathname.includes('/participants')) return 'participants'
    if (pathname.includes('/permissions')) return 'permissions'
    if (pathname.includes('/directories')) return 'directories'
    if (pathname.includes('/templates')) return 'templates'
    if (pathname.includes('/integrations')) return 'integrations'
    if (pathname.includes('/digest')) return 'digest'
    if (pathname.includes('/sidebar')) return 'sidebar'
    if (pathname.includes('/domain')) return 'domain'
    if (pathname.includes('/trash')) return 'trash'
    return 'general'
  }

  const handleTabChange = (tab: string) => {
    router.push(`/workspaces/${workspaceId}/settings/${tab}`)
  }

  const activeTab = getActiveTab()
  usePageTitle(SETTINGS_TAB_TITLES[activeTab] ?? 'Настройки')

  // Guard: если у юзера нет прав ни на одну вкладку — выкидываем из раздела
  // настроек целиком. Иначе — точечный редирект с конкретного запрещённого таба.
  useEffect(() => {
    if (permissions.isLoading) return
    if (!hasAnySettingsAccess) {
      router.replace(`/workspaces/${workspaceId}`)
      return
    }
    if (activeTab === 'general' && !canManageSettings) {
      router.replace(`/workspaces/${workspaceId}/settings/directories`)
    } else if (activeTab === 'participants' && !canManageParticipants) {
      router.replace(`/workspaces/${workspaceId}/settings/general`)
    } else if (activeTab === 'permissions' && !canManageRoles) {
      router.replace(`/workspaces/${workspaceId}/settings/general`)
    } else if (activeTab === 'templates' && !canManageTemplates) {
      router.replace(`/workspaces/${workspaceId}/settings/general`)
    }
  }, [
    activeTab,
    canManageParticipants,
    canManageRoles,
    canManageSettings,
    canManageTemplates,
    hasAnySettingsAccess,
    permissions.isLoading,
    router,
    workspaceId,
  ])

  // Пока проверяем права — ничего не рендерим, чтобы клиент даже на миг не
  // увидел мерцание содержимого настроек до редиректа.
  if (permissions.isLoading || !hasAnySettingsAccess) {
    return (
      <WorkspaceLayout>
        <main className="flex-1 p-8 overflow-auto" />
      </WorkspaceLayout>
    )
  }

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
              {canManageSettings && (
                <TabsTrigger value="general" onClick={() => handleTabChange('general')}>
                  Настройки
                </TabsTrigger>
              )}
              {canManageParticipants && (
                <TabsTrigger value="participants" onClick={() => handleTabChange('participants')}>
                  Участники
                </TabsTrigger>
              )}
              {canManageRoles && (
                <TabsTrigger value="permissions" onClick={() => handleTabChange('permissions')}>
                  Права доступа
                </TabsTrigger>
              )}
              <TabsTrigger
                value="directories"
                onClick={() => handleTabChange('directories')}
              >
                Справочники
              </TabsTrigger>
              {canManageTemplates && (
                <TabsTrigger
                  value="templates"
                  onClick={() => handleTabChange('templates')}
                >
                  Шаблоны
                </TabsTrigger>
              )}
              {permissions.isOwner && (
                <TabsTrigger value="integrations" onClick={() => handleTabChange('integrations')}>
                  Интеграции
                </TabsTrigger>
              )}
              {permissions.isOwner && (
                <TabsTrigger value="digest" onClick={() => handleTabChange('digest')}>
                  Дневник проекта
                </TabsTrigger>
              )}
              {permissions.isOwner && (
                <TabsTrigger value="sidebar" onClick={() => handleTabChange('sidebar')}>
                  Сайдбар
                </TabsTrigger>
              )}
              {permissions.isOwner && (
                <TabsTrigger value="domain" onClick={() => handleTabChange('domain')}>
                  Домен
                </TabsTrigger>
              )}
              {(permissions.isOwner || permissions.can('manage_workspace_settings')) && (
                <TabsTrigger value="trash" onClick={() => handleTabChange('trash')}>
                  Корзина
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>

          {/* Tab content */}
          <Suspense fallback={<div className="p-4">Загрузка...</div>}>
            {activeTab === 'general' && canManageSettings && <GeneralSettingsTab />}
            {activeTab === 'participants' && canManageParticipants && <ParticipantsTab />}
            {activeTab === 'permissions' && canManageRoles && <PermissionsTab />}
            {(activeTab === 'directories' || pathname.includes('/directories')) && <DirectoriesTab />}
            {(activeTab === 'templates' || pathname.includes('/templates')) &&
              canManageTemplates && <TemplatesTab />}
            {activeTab === 'integrations' && <IntegrationsTab />}
            {activeTab === 'digest' && <DigestSettingsTab />}
            {activeTab === 'sidebar' && <SidebarSettingsTab />}
            {activeTab === 'domain' && permissions.isOwner && <DomainSettingsTab />}
            {activeTab === 'trash' && <TrashTab />}
          </Suspense>
        </div>
      </main>
    </WorkspaceLayout>
  )
}
