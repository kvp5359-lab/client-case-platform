"use client"

import { memo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Settings, Plus, Check } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Workspace, Participant } from '@/types/entities'

const ROOT_DOMAIN = 'clientcase.app'

type WorkspaceWithParticipant = {
  participant?: Participant
} & Workspace

export type WorkspacePickerProps = {
  workspaces: WorkspaceWithParticipant[]
  currentWorkspace?: WorkspaceWithParticipant
  workspaceId?: string
  loadingWorkspaces: boolean
  isOwner: boolean
  canManageSettings: boolean
}

/**
 * Построить URL для перехода на воркспейс.
 * - Если есть slug → переход на <slug>.clientcase.app (cross-subdomain).
 * - Если есть custom_domain → переход на этот домен.
 * - Иначе → legacy /workspaces/<uuid> (на текущем host'е).
 */
function buildWorkspaceUrl(workspace: WorkspaceWithParticipant): string {
  if (workspace.slug) return `https://${workspace.slug}.${ROOT_DOMAIN}/`
  if (workspace.custom_domain) return `https://${workspace.custom_domain}/`
  return `/workspaces/${workspace.id}`
}

function isCrossDomainTarget(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/**
 * Определяем, что мы сейчас на custom_domain текущего воркспейса.
 * На custom_domain не показываем другие воркспейсы — это «брендированная» точка входа,
 * клиенты не должны видеть остальные воркспейсы пользователя.
 */
function isOnOwnCustomDomain(currentWorkspace?: WorkspaceWithParticipant): boolean {
  if (typeof window === 'undefined') return false
  if (!currentWorkspace?.custom_domain) return false
  return window.location.hostname.toLowerCase() === currentWorkspace.custom_domain.toLowerCase()
}

export const WorkspacePicker = memo(function WorkspacePicker({
  workspaces,
  currentWorkspace,
  workspaceId,
  loadingWorkspaces,
  isOwner,
  canManageSettings,
}: WorkspacePickerProps) {
  const router = useRouter()
  const onCustomDomain = isOnOwnCustomDomain(currentWorkspace)
  // На custom_domain показываем только текущий воркспейс
  const visibleWorkspaces = onCustomDomain
    ? workspaces.filter((w) => w.id === currentWorkspace?.id)
    : workspaces

  const navigateToWorkspace = (workspace: WorkspaceWithParticipant) => {
    const url = buildWorkspaceUrl(workspace)
    if (isCrossDomainTarget(url)) {
      // Full reload — переход на другой поддомен / custom-домен
      // eslint-disable-next-line react-hooks/immutability -- штатная навигация через window.location, false positive правила
      window.location.href = url
    } else {
      router.push(url)
    }
  }

  const navigateToSettings = (workspace: WorkspaceWithParticipant) => {
    const baseUrl = buildWorkspaceUrl(workspace)
    if (isCrossDomainTarget(baseUrl)) {
      // eslint-disable-next-line react-hooks/immutability -- штатная навигация через window.location, false positive правила
      window.location.href = baseUrl + 'settings'
    } else {
      router.push(`/workspaces/${workspace.id}/settings`)
    }
  }

  return (
    <div className="px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between h-8 px-2">
            <div className="flex items-center gap-2 min-w-0">
              {currentWorkspace ? (
                <>
                  <Avatar className="h-5 w-5 flex-shrink-0">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      {currentWorkspace.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium truncate">{currentWorkspace.name}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Выбрать пространство</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-72 overflow-x-hidden">
          {loadingWorkspaces ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">Загрузка...</div>
          ) : visibleWorkspaces.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              Нет доступных пространств.
              <br />
              Если ожидалось увидеть пространство — попросите администратора
              добавить вас, либо попробуйте выйти и войти снова.
            </div>
          ) : (
            <>
              {visibleWorkspaces.map((workspace) => {
                const isActive = workspace.id === workspaceId

                return (
                  <div key={workspace.id}>
                    <DropdownMenuItem
                      onClick={() => navigateToWorkspace(workspace)}
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Avatar className="h-5 w-5 flex-shrink-0">
                        <AvatarFallback className="bg-gray-600 text-white text-xs">
                          {workspace.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{workspace.name}</p>
                        {workspace.slug && (
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {workspace.slug}.{ROOT_DOMAIN}
                          </p>
                        )}
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(isOwner || canManageSettings) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                navigateToSettings(workspace)
                              }}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title="Настройки"
                            >
                              <Settings className="h-4 w-4 text-muted-foreground" />
                            </button>
                          )}
                          <Check className="h-4 w-4 text-primary" />
                        </div>
                      )}
                    </DropdownMenuItem>
                  </div>
                )
              })}
            </>
          )}

          {!onCustomDomain && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push('/workspaces')} className="cursor-pointer">
                <Plus className="mr-2 h-4 w-4" />
                Новое пространство
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
