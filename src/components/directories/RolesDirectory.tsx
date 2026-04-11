/**
 * RolesDirectory — управление справочником ролей (workspace и project)
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, GripVertical, Shield } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Database } from '@/types/database'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RoleFormDialog } from './RoleFormDialog'
import type { RoleInsert } from './RoleFormDialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { ColorDot } from '@/components/ui/color-dot'
import { STALE_TIME } from '@/hooks/queryKeys'

type WorkspaceRole = Database['public']['Tables']['workspace_roles']['Row']
type ProjectRole = Database['public']['Tables']['project_roles']['Row']
const rolesQueryKey = (workspaceId: string, type: string) =>
  ['roles', 'directory', workspaceId, type] as const

interface RolesDirectoryProps {
  type: 'workspace' | 'project'
}

export function RolesDirectory({ type }: RolesDirectoryProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()
  const tableName = type === 'workspace' ? 'workspace_roles' : 'project_roles'
  const title = type === 'workspace' ? 'Роли workspace' : 'Роли проекта'
  const description =
    type === 'workspace' ? 'Роли участников в рабочем пространстве' : 'Роли участников в проектах'

  // Диалог создания/редактирования
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<WorkspaceRole | ProjectRole | null>(null)
  const [formData, setFormData] = useState<RoleInsert>({
    workspace_id: workspaceId || '',
    name: '',
    description: '',
    color: '#6B7280',
    order_index: 0,
  })

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // --- Загрузка ролей через React Query ---
  const {
    data: roles = [],
    isLoading: loading,
    error: queryError,
  } = useQuery<(WorkspaceRole | ProjectRole)[]>({
    queryKey: rolesQueryKey(workspaceId ?? '', type),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('order_index')

      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId,
    staleTime: STALE_TIME.LONG,
  })

  // --- Мутация: сохранение ---
  const saveMutation = useMutation({
    mutationFn: async (params: {
      editing: WorkspaceRole | ProjectRole | null
      data: RoleInsert
    }) => {
      if (params.editing) {
        const { error } = await supabase
          .from(tableName)
          .update({
            name: params.data.name.trim(),
            description: params.data.description?.trim() || null,
            color: params.data.color,
            order_index: params.data.order_index,
          })
          .eq('id', params.editing.id)
          .select()
          .single()
        if (error) throw error
      } else {
        const { error } = await supabase
          .from(tableName)
          .insert([
            {
              workspace_id: workspaceId ?? '',
              name: params.data.name.trim(),
              description: params.data.description?.trim() || null,
              color: params.data.color,
              order_index: params.data.order_index,
            },
          ])
          .select()
          .single()
        if (error) throw error
      }
    },
    onSuccess: (_, params) => {
      toast.success(params.editing ? 'Роль обновлена' : 'Роль создана')
      queryClient.invalidateQueries({ queryKey: rolesQueryKey(workspaceId ?? '', type) })
      setIsDialogOpen(false)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить роль')
    },
  })

  // --- Мутация: удаление ---
  const deleteMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase.from(tableName).delete().eq('id', roleId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Роль удалена')
      queryClient.invalidateQueries({ queryKey: rolesQueryKey(workspaceId ?? '', type) })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить роль')
    },
  })

  const openCreateDialog = () => {
    setEditingRole(null)
    setFormData({
      workspace_id: workspaceId || '',
      name: '',
      description: '',
      color: '#6B7280',
      order_index: roles.length,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (role: WorkspaceRole | ProjectRole) => {
    setEditingRole(role)
    setFormData({
      workspace_id: role.workspace_id,
      name: role.name,
      description: role.description || '',
      color: role.color,
      order_index: role.order_index,
    })
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast.error('Введите название роли')
      return
    }
    if (editingRole?.is_system) {
      toast.error('Системные роли нельзя редактировать')
      return
    }
    saveMutation.mutate({ editing: editingRole, data: formData })
  }

  const handleDelete = async (role: WorkspaceRole | ProjectRole) => {
    if (role.is_system) {
      toast.error('Системные роли нельзя удалять')
      return
    }

    const ok = await confirm({
      title: 'Удалить роль?',
      description: `Роль "${role.name}" будет удалена. Это действие нельзя отменить.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return

    deleteMutation.mutate(role.id)
  }

  const saving = saveMutation.isPending
  const error = queryError ? 'Не удалось загрузить роли' : null

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button size="sm" onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-1" />
            Добавить
          </Button>
        </CardHeader>
        <CardContent>
          {loading || roles.length === 0 ? (
            <EmptyState loading={loading} emptyText="Нет ролей" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Название</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead className="w-20 text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <GripVertical className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ColorDot color={role.color} />
                        <span className="font-medium">{role.name}</span>
                        {role.is_system && (
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Shield className="h-3 w-3" />
                            Системная
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">
                      {role.description || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!role.is_system && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(role)}
                              aria-label="Редактировать"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDelete(role)}
                              disabled={deleteMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              aria-label="Удалить"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Подсказка */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
        <p className="font-medium">💡 Подсказка</p>
        <p className="mt-1">
          {type === 'workspace'
            ? 'Роли workspace определяют общий уровень доступа участника: admin, manager, user и т.д.'
            : 'Роли проекта определяют функции участника в конкретном проекте: руководитель, исполнитель, клиент и т.д.'}
        </p>
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <RoleFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingRole={editingRole}
        formData={formData}
        onFormDataChange={setFormData}
        onSave={handleSave}
        saving={saving}
        type={type}
      />
    </div>
  )
}

export function WorkspaceRolesDirectory() {
  return <RolesDirectory type="workspace" />
}

export function ProjectRolesDirectory() {
  return <RolesDirectory type="project" />
}
