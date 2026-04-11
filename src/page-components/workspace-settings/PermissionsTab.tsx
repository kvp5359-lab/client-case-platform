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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Crown, Shield, Users, Edit2, Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import type { Database } from '@/types/database'
import { WorkspaceRoleEditDialog, ProjectRoleEditDialog } from './permissions'
import { permissionKeys } from '@/hooks/queryKeys'

type WorkspaceRole = Database['public']['Tables']['workspace_roles']['Row']
type ProjectRole = Database['public']['Tables']['project_roles']['Row']

export function PermissionsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()

  const [editingWorkspaceRole, setEditingWorkspaceRole] = useState<WorkspaceRole | null>(null)
  const [editingProjectRole, setEditingProjectRole] = useState<ProjectRole | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    workspace: true,
    project: true,
  })

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

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Права доступа</h2>
        <p className="text-gray-600">Управление ролями и разрешениями workspace и проектов</p>
      </div>

      {/* Роли Workspace */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('workspace')}
          role="button"
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleSection('workspace')
            }
          }}
          aria-expanded={expandedSections.workspace}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {expandedSections.workspace ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
              <CardTitle>Роли Workspace</CardTitle>
              <Badge variant="secondary">{workspaceRoles?.length || 0}</Badge>
            </div>
          </div>
          <CardDescription>Роли определяют доступ к функциям рабочего пространства</CardDescription>
        </CardHeader>

        {expandedSections.workspace && (
          <CardContent className="space-y-3">
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
          </CardContent>
        )}
      </Card>

      {/* Роли Проекта */}
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => toggleSection('project')}
          role="button"
          tabIndex={0}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleSection('project')
            }
          }}
          aria-expanded={expandedSections.project}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {expandedSections.project ? (
                <ChevronDown className="h-5 w-5" />
              ) : (
                <ChevronRight className="h-5 w-5" />
              )}
              <CardTitle>Роли Проекта</CardTitle>
              <Badge variant="secondary">{projectRoles?.length || 0}</Badge>
            </div>
          </div>
          <CardDescription>
            Роли определяют доступ к модулям и действиям внутри проектов
          </CardDescription>
        </CardHeader>

        {expandedSections.project && (
          <CardContent className="space-y-3">
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
          </CardContent>
        )}
      </Card>

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
