"use client"

import { useState } from 'react'
import { toast } from 'sonner'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Tables } from '@/types/database'
import { PROJECT_STATUSES } from './ProjectPage/constants'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Search, MoreHorizontal, Trash2, Filter } from 'lucide-react'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useAuth } from '@/contexts/AuthContext'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useDialog } from '@/hooks/shared/useDialog'
import { projectKeys } from '@/hooks/queryKeys'

type Project = Tables<'projects'>

export default function ProjectsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const createDialog = useDialog()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set(['active', 'paused']))
  const { workspaceId: currentWorkspaceId } = useWorkspaceContext()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const permissionsResult = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // workspaceId из URL (приоритет) или из store
  const activeWorkspaceId = workspaceId || currentWorkspaceId

  const {
    data: projects,
    isLoading,
    refetch,
  } = useQuery({
    // Z5-35: permissionsResult влияет на queryFn (canViewAll) — добавлен в queryKey.
    // TODO queryKeys: сложный ключ, переносить вдумчиво — callsite хранит в ключе
    // can('view_all_projects') отдельно, а в queryFn canViewAll вычисляется ещё и
    // с OR isOwner. Т.е. семантика ключа и фабрики projectKeys.listForUser не совпадает.
    queryKey: [
      'projects',
      activeWorkspaceId,
      user?.id,
      permissionsResult.isOwner,
      permissionsResult.can('view_all_projects'),
    ],
    queryFn: async () => {
      if (!activeWorkspaceId) return []

      const canViewAll = permissionsResult.isOwner || permissionsResult.can('view_all_projects')

      // Z5-06: один RPC вместо 3 последовательных запросов
      const { data, error } = await supabase.rpc('get_user_projects', {
        p_workspace_id: activeWorkspaceId,
        p_user_id: user!.id,
        p_can_view_all: canViewAll,
      })

      if (error) throw error
      return (data || []) as Project[]
    },
    enabled: !!activeWorkspaceId && !permissionsResult.isLoading,
  })

  // Мягкое удаление проекта — проект уходит в корзину (раздел «Корзина» в настройках воркспейса).
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const { error } = await supabase
        .from('projects')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id ?? null,
        })
        .eq('id', projectId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.byWorkspace(activeWorkspaceId ?? '') })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    const ok = await confirm({
      title: 'Удалить проект?',
      description: `Проект "${projectName}" будет перемещён в корзину. Восстановить можно из раздела «Корзина» в настройках воркспейса.`,
      variant: 'destructive',
      confirmText: 'В корзину',
    })
    if (!ok) return
    try {
      await deleteProjectMutation.mutateAsync(projectId)
      toast.success('Проект перемещён в корзину')
    } catch {
      toast.error('Не удалось удалить проект')
    }
  }

  if (!activeWorkspaceId) {
    return (
      <WorkspaceLayout>
        <div className="flex-1 flex items-center justify-center">
          <p className="text-muted-foreground">Выберите workspace для просмотра проектов</p>
        </div>
      </WorkspaceLayout>
    )
  }

  const toggleStatus = (value: string) => {
    setStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  // Фильтрация проектов по поиску и статусу
  const filteredProjects =
    projects?.filter((project) => {
      const matchesSearch =
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter.size === 0 || statusFilter.has(project.status || 'active')
      return matchesSearch && matchesStatus
    }) || []

  return (
    <WorkspaceLayout>
      <div className="flex-1 overflow-auto p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Заголовок */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">Проекты</h1>
              <p className="text-muted-foreground mt-1">Список всех проектов в workspace</p>
            </div>
            <Button onClick={createDialog.open}>
              <Plus className="w-4 h-4 mr-2" />
              Создать проект
            </Button>
          </div>

          {/* Панель фильтров */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск проектов..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="h-4 w-4" />
                  Статус
                  {statusFilter.size > 0 && statusFilter.size < PROJECT_STATUSES.length && (
                    <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                      {statusFilter.size}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48 p-2" align="start">
                {PROJECT_STATUSES.map((s) => (
                  <label
                    key={s.value}
                    className="flex items-center gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-muted transition-colors"
                  >
                    <Checkbox
                      checked={statusFilter.has(s.value)}
                      onCheckedChange={() => toggleStatus(s.value)}
                    />
                    <span className="text-sm">{s.label}</span>
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Таблица проектов */}
          {isLoading ? (
            <Card className="p-12">
              <div className="text-center">
                <p className="text-muted-foreground">Загрузка...</p>
              </div>
            </Card>
          ) : filteredProjects.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[300px] pl-6">Название</TableHead>
                    <TableHead className="pl-6">Описание</TableHead>
                    <TableHead className="w-[120px] pl-6">Статус</TableHead>
                    <TableHead className="w-[130px] pl-6">Создан</TableHead>
                    <TableHead className="w-[130px] pl-6">Обновлён</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProjects.map((project) => (
                    <TableRow key={project.id}>
                      <TableCell className="font-medium pl-6">
                        <Link
                          href={`/workspaces/${activeWorkspaceId}/projects/${project.id}?tab=settings`}
                          className="text-foreground hover:underline"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground pl-6">
                        {project.description || '—'}
                      </TableCell>
                      <TableCell className="pl-6">
                        {(() => {
                          const status =
                            PROJECT_STATUSES.find((s) => s.value === project.status) ||
                            PROJECT_STATUSES[0]
                          return (
                            <Badge
                              variant="secondary"
                              className={`${status.color} hover:opacity-90`}
                            >
                              {status.label}
                            </Badge>
                          )
                        })()}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground pl-6">
                        {new Date(project.created_at ?? '').toLocaleDateString('ru-RU')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground pl-6">
                        {new Date(project.updated_at ?? '').toLocaleDateString('ru-RU')}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {(permissionsResult.isOwner ||
                              permissionsResult.can('edit_all_projects')) && (
                              <>
                                <DropdownMenuItem
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteProject(project.id, project.name)}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Удалить
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Футер таблицы с пагинацией */}
              <div className="flex items-center justify-between px-6 py-3 border-t">
                <div className="text-sm text-muted-foreground">
                  Показано {filteredProjects.length} из {projects?.length || 0} проектов
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-12">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">
                  {searchQuery ? 'Проекты не найдены' : 'Нет проектов'}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery
                    ? 'Попробуйте изменить условия поиска'
                    : 'Создайте первый проект для начала работы'}
                </p>
                {!searchQuery && (
                  <Button onClick={createDialog.open}>
                    <Plus className="w-4 h-4 mr-2" />
                    Создать проект
                  </Button>
                )}
              </div>
            </Card>
          )}

          {/* Диалог создания проекта */}
          <CreateProjectDialog
            open={createDialog.isOpen}
            onOpenChange={(open) => (open ? createDialog.open() : createDialog.close())}
            onSuccess={() => {
              refetch()
              createDialog.close()
            }}
          />

          <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
        </div>
      </div>
    </WorkspaceLayout>
  )
}
