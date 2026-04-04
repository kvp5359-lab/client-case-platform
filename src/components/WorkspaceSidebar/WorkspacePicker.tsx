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

interface WorkspaceWithParticipant extends Workspace {
  participant?: Participant
}

export interface WorkspacePickerProps {
  workspaces: WorkspaceWithParticipant[]
  currentWorkspace?: WorkspaceWithParticipant
  workspaceId?: string
  loadingWorkspaces: boolean
  isOwner: boolean
  canManageSettings: boolean
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

  return (
    <div className="px-2 pt-3 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between h-10">
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
          ) : workspaces.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">Нет доступных пространств</div>
          ) : (
            <>
              {workspaces.map((workspace) => {
                const isActive = workspace.id === workspaceId

                return (
                  <div key={workspace.id}>
                    <DropdownMenuItem
                      onClick={() => router.push(`/workspaces/${workspace.id}`)}
                      className="cursor-pointer flex items-center gap-2"
                    >
                      <Avatar className="h-5 w-5 flex-shrink-0">
                        <AvatarFallback className="bg-gray-600 text-white text-xs">
                          {workspace.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{workspace.name}</p>
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {(isOwner || canManageSettings) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(`/workspaces/${workspace.id}/settings`)
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

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => router.push('/workspaces')} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Новое пространство
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
