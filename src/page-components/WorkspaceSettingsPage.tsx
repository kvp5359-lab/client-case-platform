"use client"

/**
 * Workspace Settings Page — настройки рабочего пространства с вкладками
 * Тяжёлые табы загружаются лениво через React.lazy
 */

import React, { Suspense, useEffect } from 'react'
import { useParams, useRouter, usePathname } from 'next/navigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { GeneralSettingsTab } from './workspace-settings/GeneralSettingsTab'
import { AccentPaletteSection } from './workspace-settings/components/AccentPaletteSection'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { usePageTitle } from '@/hooks/usePageTitle'

const SETTINGS_TAB_TITLES: Record<string, string> = {
  general: 'Настройки',
  palette: 'Палитра цветов',
  usage: 'Использование',
  participants: 'Участники',
  permissions: 'Права',
  directories: 'Справочники',
  templates: 'Шаблоны',
  integrations: 'Интеграции',
  digest: 'Дневник проекта',
  sidebar: 'Сайдбар',
  domain: 'Домен',
  trash: 'Корзина',
  'send-failures': 'Журнал неотправленных',
}

// Описание под общим заголовком раздела (единый стиль; вкладки больше не
// рендерят свои дублирующие h2 + описание).
const SETTINGS_TAB_DESCRIPTIONS: Record<string, string> = {
  general: 'Основная информация о рабочем пространстве',
  palette: 'Цвета акцента для чатов и задач',
  usage: 'Тариф, лимиты и статистика ресурсов воркспейса',
  participants: 'Команда воркспейса и контакты',
  permissions: 'Роли и права доступа участников',
  directories: 'Управление справочниками и настройками',
  templates: 'Шаблоны проектов, анкет, документов и тредов',
  integrations: 'Подключение каналов связи',
  digest: 'Настройки автоматического дневника проекта',
  domain: 'Собственный домен и почтовый адрес',
  trash: 'Удалённые проекты и треды',
  'send-failures': 'Сообщения, которые не удалось отправить',
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
const SendFailuresTab = React.lazy(() =>
  import('./workspace-settings/SendFailuresTab').then((m) => ({ default: m.SendFailuresTab })),
)
const WorkspaceUsageTab = React.lazy(() =>
  import('./workspace-settings/WorkspaceUsageTab').then((m) => ({ default: m.WorkspaceUsageTab })),
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
    if (pathname.includes('/palette')) return 'palette'
    if (pathname.includes('/usage')) return 'usage'
    if (pathname.includes('/participants')) return 'participants'
    if (pathname.includes('/permissions')) return 'permissions'
    if (pathname.includes('/directories')) return 'directories'
    if (pathname.includes('/templates')) return 'templates'
    if (pathname.includes('/integrations')) return 'integrations'
    if (pathname.includes('/digest')) return 'digest'
    if (pathname.includes('/sidebar')) return 'sidebar'
    if (pathname.includes('/domain')) return 'domain'
    if (pathname.includes('/send-failures')) return 'send-failures'
    if (pathname.includes('/trash')) return 'trash'
    return 'general'
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
    if ((activeTab === 'general' || activeTab === 'palette' || activeTab === 'usage') && !canManageSettings) {
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
      {/* Каркас раздела настроек: фиксированная высота, БЕЗ внешнего скролла —
          колонки контента прокручиваются независимо внутри себя. */}
      <main className="flex-1 min-h-0 flex flex-col px-6 pt-6 pb-4 overflow-hidden">
        <div className="max-w-6xl w-full mx-auto flex flex-col flex-1 min-h-0">
          {/* Заголовок раздела (навигация — в боковом меню настроек) */}
          <div className="shrink-0 mb-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {SETTINGS_TAB_TITLES[activeTab] ?? 'Настройки'}
            </h1>
            {SETTINGS_TAB_DESCRIPTIONS[activeTab] && (
              <p className="text-gray-600 mt-1">{SETTINGS_TAB_DESCRIPTIONS[activeTab]}</p>
            )}
          </div>

          {/* Контент вкладки — заполняет оставшуюся высоту; внутренний скролл. */}
          <div className="flex-1 min-h-0">
            <Suspense fallback={<div className="p-4">Загрузка...</div>}>
              {activeTab === 'general' && canManageSettings && <GeneralSettingsTab />}
              {activeTab === 'palette' && canManageSettings && workspaceId && (
                <AccentPaletteSection workspaceId={workspaceId} />
              )}
              {activeTab === 'usage' && canManageSettings && <WorkspaceUsageTab />}
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
              {activeTab === 'send-failures' && <SendFailuresTab />}
            </Suspense>
          </div>
        </div>
      </main>
    </WorkspaceLayout>
  )
}
