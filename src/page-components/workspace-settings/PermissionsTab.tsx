/**
 * PermissionsTab - вкладка управления правами доступа
 *
 * Содержит:
 * - Список ролей workspace
 * - Список ролей проекта
 * - Возможность редактирования разрешений
 *
 * Подкомпоненты вынесены в ./permissions/
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { safeCssColor } from '@/utils/isValidCssColor'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Crown, Shield, Users, Edit2, Trash2, Plus } from 'lucide-react'
import type { Database } from '@/types/database'
import { WorkspaceRoleEditDialog, ProjectRoleEditDialog } from './permissions'
import { permissionKeys } from '@/hooks/queryKeys'
import { SettingsSubNav } from './components/SettingsSubNav'

type WorkspaceRole = Database['public']['Tables']['workspace_roles']['Row']
type ProjectRole = Database['public']['Tables']['project_roles']['Row']

export function PermissionsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()

  const [editingWorkspaceRole, setEditingWorkspaceRole] = useState<WorkspaceRole | null>(null)
  const [editingProjectRole, setEditingProjectRole] = useState<ProjectRole | null>(null)
  const [active, setActive] = useState<'workspace' | 'project'>('workspace')

  // Загрузка ролей workspace
  const { data: workspaceRoles, isLoading: loadingWsRoles } = useQuery({
    queryKey: permissionKeys.workspaceRoles(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('workspace_roles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('order_index')
      if (error) throw error
      return data as WorkspaceRole[]
    },
    enabled: !!workspaceId,
  })

  // Загрузка ролей проекта
  const { data: projectRoles, isLoading: loadingProjRoles } = useQuery({
    queryKey: permissionKeys.projectRoles(workspaceId),
    queryFn: async () => {
      if (!workspaceId) return []
      const { data, error } = await supabase
        .from('project_roles')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('order_index')
      if (error) throw error
      return data as ProjectRole[]
    },
    enabled: !!workspaceId,
  })

  // Мутация для обновления роли workspace
  const updateWorkspaceRoleMutation = useMutation({
    mutationFn: async (role: Partial<WorkspaceRole> & { id: string }) => {
      const { error } = await supabase.from('workspace_roles').update(role).eq('id', role.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: permissionKeys.workspaceRoles(workspaceId) })
      setEditingWorkspaceRole(null)
    },
    onError: (error) => {
      logger.error('Ошибка обновления роли workspace:', error)
      toast.error('Не удалось обновить роль workspace')
    },
  })

  // Мутация для обновления роли проекта
  const updateProjectRoleMutation = useMutation({
    mutationFn: async (role: Partial<ProjectRole> & { id: string }) => {
      const { error } = await supabase.from('project_roles').update(role).eq('id', role.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: permissionKeys.projectRoles(workspaceId) })
      setEditingProjectRole(null)
    },
    onError: (error) => {
      logger.error('Ошибка обновления роли проекта:', error)
      toast.error('Не удалось обновить роль проекта')
    },
  })

  const getRoleIcon = (role: WorkspaceRole) => {
    if (role.is_owner) return Crown
    if (role.is_system && !role.is_owner) return Shield
    return Users
  }

  if (loadingWsRoles || loadingProjRoles) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-32 bg-muted rounded" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    )
  }

  const wsCount = workspaceRoles?.length || 0
  const projCount = projectRoles?.length || 0

  return (
    <div className="flex h-full bg-white rounded-lg border overflow-hidden">
      <SettingsSubNav
        groups={[
          {
            items: [
              { id: 'workspace', label: 'Роли Workspace', icon: Shield, count: wsCount },
              { id: 'project', label: 'Роли Проекта', icon: Users, count: projCount },
            ],
          },
        ]}
        activeId={active}
        onSelect={(id) => setActive(id as 'workspace' | 'project')}
      />

      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        <p className="text-sm text-muted-foreground mb-4">
          {active === 'workspace'
            ? 'Роли определяют доступ к функциям рабочего пространства'
            : 'Роли определяют доступ к модулям и действиям внутри проектов'}
        </p>

        {active === 'workspace' && (
          <div className="space-y-3">
            {workspaceRoles?.map((role) => {
              const Icon = getRoleIcon(role)
              return (
                <div
                  key={role.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: `color-mix(in srgb, ${safeCssColor(role.color)} 12%, transparent)`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color: safeCssColor(role.color) }} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{role.name}</span>
                        {role.is_owner && (
                          <Badge variant="outline" className="text-xs">
                            Владелец
                          </Badge>
                        )}
                        {role.is_system && !role.is_owner && (
                          <Badge variant="secondary" className="text-xs">
                            Системная
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{role.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!role.is_owner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingWorkspaceRole(role)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    )}
                    {!role.is_system && (
                      <Button variant="ghost" size="sm" className="text-destructive" disabled>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}

            <Button variant="outline" className="w-full mt-4" disabled>
              <Plus className="h-4 w-4 mr-2" />
              Добавить роль (скоро)
            </Button>
          </div>
        )}

        {active === 'project' && (
          <div className="space-y-3">
            {projectRoles?.map((role) => (
              <div
                key={role.id}
                className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: `color-mix(in srgb, ${safeCssColor(role.color)} 12%, transparent)`,
                    }}
                  >
                    <Users className="h-5 w-5" style={{ color: safeCssColor(role.color) }} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{role.name}</span>
                      {role.is_system && (
                        <Badge variant="secondary" className="text-xs">
                          Системная
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{role.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingProjectRole(role)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  {!role.is_system && (
                    <Button variant="ghost" size="sm" className="text-destructive" disabled>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            <Button variant="outline" className="w-full mt-4" disabled>
              <Plus className="h-4 w-4 mr-2" />
              Добавить роль (скоро)
            </Button>
          </div>
        )}
      </div>

      {/* Диалог редактирования роли workspace */}
      <WorkspaceRoleEditDialog
        role={editingWorkspaceRole}
        onClose={() => setEditingWorkspaceRole(null)}
        onSave={(updates) => {
          if (editingWorkspaceRole) {
            updateWorkspaceRoleMutation.mutate({ id: editingWorkspaceRole.id, ...updates })
          }
        }}
        isSaving={updateWorkspaceRoleMutation.isPending}
      />

      {/* Диалог редактирования роли проекта */}
      <ProjectRoleEditDialog
        role={editingProjectRole}
        onClose={() => setEditingProjectRole(null)}
        onSave={(updates) => {
          if (editingProjectRole) {
            updateProjectRoleMutation.mutate({ id: editingProjectRole.id, ...updates })
          }
        }}
        isSaving={updateProjectRoleMutation.isPending}
      />
    </div>
  )
}
