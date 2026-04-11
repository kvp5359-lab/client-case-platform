"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, MoreVertical, Pencil, Trash2, Settings } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Database } from '@/types/database'
import { workspaceKeys, STALE_TIME } from '@/hooks/queryKeys'
import { toast } from 'sonner'

type Workspace = Database['public']['Tables']['workspaces']['Row']
type WorkspaceInsert = Database['public']['Tables']['workspaces']['Insert']
type WorkspaceWithCount = Workspace & { participants_count?: number }

/**
 * Загрузка workspaces с подсчётом участников
 */
async function fetchWorkspacesWithCounts(userId: string): Promise<WorkspaceWithCount[]> {
  // загружаем workspaces и counts в 2 параллельных запроса вместо N+1
  const [workspacesResult, countsResult] = await Promise.all([
    supabase
      .from('workspaces')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
    supabase.rpc('get_workspaces_with_counts', { p_user_id: userId }),
  ])

  if (workspacesResult.error) throw workspacesResult.error

  const countMap: Record<string, number> = {}
  for (const row of countsResult.data || []) {
    countMap[row.workspace_id] = Number(row.participants_count)
  }

  return (workspacesResult.data || []).map((workspace) => ({
    ...workspace,
    participants_count: countMap[workspace.id] || 0,
  }))
}

export function WorkspacesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const queryClient = useQueryClient()

  // Загрузка workspaces через React Query
  const {
    data: workspaces = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: workspaceKeys.all,
    queryFn: () => fetchWorkspacesWithCounts(user!.id),
    staleTime: STALE_TIME.LONG,
  })

  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [newWorkspace, setNewWorkspace] = useState<WorkspaceInsert>({
    name: '',
    description: '',
  })
  const [editingWorkspace, setEditingWorkspace] = useState<WorkspaceWithCount | null>(null)
  const [showEditForm, setShowEditForm] = useState(false)

  // Мутации через React Query
  const createMutation = useMutation({
    mutationFn: async (data: WorkspaceInsert) => {
      const { error } = await supabase
        .from('workspaces')
        .insert([{ name: data.name!.trim(), description: data.description?.trim() || null }])
        .select()
        .single()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
      setNewWorkspace({ name: '', description: '' })
      setShowCreateForm(false)
      toast.success('Workspace создан')
    },
    onError: () => {
      toast.error('Не удалось создать workspace')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (ws: WorkspaceWithCount) => {
      const { error } = await supabase
        .from('workspaces')
        .update({ name: ws.name.trim(), description: ws.description?.trim() || null })
        .eq('id', ws.id)
        .select()
        .single()
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
      setEditingWorkspace(null)
      setShowEditForm(false)
      toast.success('Workspace обновлён')
    },
    onError: () => {
      toast.error('Не удалось обновить workspace')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const { error } = await supabase
        .from('workspaces')
        .update({ is_deleted: true })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
      toast.success('Workspace удалён')
    },
    onError: () => {
      toast.error('Не удалось удалить workspace')
    },
  })

  const mutationError =
    createMutation.error?.message ?? updateMutation.error?.message ?? deleteMutation.error?.message
  const error = mutationError || (queryError ? 'Не удалось загрузить workspace' : null)

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newWorkspace.name?.trim()) return
    createMutation.mutate(newWorkspace)
  }

  const handleEditWorkspace = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingWorkspace || !editingWorkspace.name?.trim()) return
    updateMutation.mutate(editingWorkspace)
  }

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const ok = await confirm({
      title: 'Удалить workspace?',
      description: 'Все связанные данные будут недоступны.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    deleteMutation.mutate(workspaceId)
  }

  // Открыть форму редактирования
  const openEditForm = (workspace: WorkspaceWithCount) => {
    setEditingWorkspace(workspace)
    setShowEditForm(true)
  }

  if (!user) {
    return (
      <div className="container max-w-4xl mx-auto p-6">
        <Alert>
          <AlertDescription>Необходимо войти в систему</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <Header />

      <div className="container max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Workspaces</h1>
            <p className="text-gray-600">Рабочие пространства вашей компании</p>
          </div>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Отмена' : '+ Создать Workspace'}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Диалог редактирования */}
        <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Редактировать Workspace</DialogTitle>
              <DialogDescription>
                Измените название и описание рабочего пространства.
              </DialogDescription>
            </DialogHeader>

            {editingWorkspace && (
              <form onSubmit={handleEditWorkspace} className="space-y-4">
                <div>
                  <Label htmlFor="edit-name">Название *</Label>
                  <Input
                    id="edit-name"
                    value={editingWorkspace.name}
                    onChange={(e) =>
                      setEditingWorkspace({ ...editingWorkspace, name: e.target.value })
                    }
                    placeholder="Моя компания"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="edit-description">Описание</Label>
                  <Input
                    id="edit-description"
                    value={editingWorkspace.description || ''}
                    onChange={(e) =>
                      setEditingWorkspace({ ...editingWorkspace, description: e.target.value })
                    }
                    placeholder="Описание workspace (необязательно)"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowEditForm(false)}>
                    Отмена
                  </Button>
                  <Button type="submit">Сохранить</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>

        {/* Форма создания */}
        {showCreateForm && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Новый Workspace</CardTitle>
              <CardDescription>Создайте рабочее пространство для вашей компании</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateWorkspace} className="space-y-4">
                <div>
                  <Label htmlFor="name">Название *</Label>
                  <Input
                    id="name"
                    value={newWorkspace.name}
                    onChange={(e) => setNewWorkspace({ ...newWorkspace, name: e.target.value })}
                    placeholder="Моя компания"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Описание</Label>
                  <Input
                    id="description"
                    value={newWorkspace.description || ''}
                    onChange={(e) =>
                      setNewWorkspace({ ...newWorkspace, description: e.target.value })
                    }
                    placeholder="Описание workspace (необязательно)"
                  />
                </div>
                <Button type="submit">Создать</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Список workspaces */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-600">Загрузка...</p>
            </CardContent>
          </Card>
        ) : workspaces.length === 0 ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-gray-600">Нет доступных workspace. Создайте первый!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {workspaces.map((workspace) => (
              <Card key={workspace.id}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <CardTitle>{workspace.name}</CardTitle>
                      {workspace.description && (
                        <CardDescription>{workspace.description}</CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/workspaces/${workspace.id}/settings`)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Настройки
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEditForm(workspace)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Редактировать
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteWorkspace(workspace.id)}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Удалить
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-500">
                        Создан: {new Date(workspace.created_at).toLocaleDateString('ru-RU')}
                      </div>
                      <Badge variant="secondary" className="gap-1">
                        <Users className="h-3 w-3" />
                        {workspace.participants_count || 0} участников
                      </Badge>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/workspaces/${workspace.id}/participants`)}
                    >
                      Участники →
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}
