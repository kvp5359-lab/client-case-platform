"use client"

/**
 * ProjectTemplateFieldsSection — выбор кастомных полей, которые будут
 * показываться на карточке проектов данного шаблона.
 *
 * Поля живут в общем справочнике `field_definitions` (per-workspace).
 * Здесь связь делается через junction `project_template_field_links` с
 * per-template-флагами `order_index` и `is_required`. Удаление «из шаблона»
 * = удаление записи в junction; само поле в справочнике остаётся и
 * доступно другим шаблонам.
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Library, ArrowUp, ArrowDown, Trash2, Pencil } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { fieldDefinitionKeys, projectTemplateKeys } from '@/hooks/queryKeys'
import { FieldDefinitionDialog } from '@/components/templates/FieldDefinitionDialog'
import { FIELD_TYPE_LABELS } from '@/components/templates/field-definition/constants'
import type { FieldDefinition } from '@/types/formKit'

interface Props {
  workspaceId: string
  projectTemplateId: string
}

interface LinkedField {
  link_id: string
  order_index: number
  is_required: boolean
  field: FieldDefinition
}

export function ProjectTemplateFieldsSection({ workspaceId, projectTemplateId }: Props) {
  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const [isLibraryOpen, setIsLibraryOpen] = useState(false)
  const [librarySelected, setLibrarySelected] = useState<Set<string>>(new Set())
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [editingField, setEditingField] = useState<FieldDefinition | null>(null)

  const linksKey = projectTemplateKeys.fieldLinks(projectTemplateId)

  // Поля шаблона (связи + сами определения)
  const { data: linked = [], isLoading } = useQuery({
    queryKey: linksKey,
    queryFn: async (): Promise<LinkedField[]> => {
      const { data, error } = await supabase
        .from('project_template_field_links')
        .select('id, order_index, is_required, field:field_definitions(*)')
        .eq('template_id', projectTemplateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row) => ({
        link_id: row.id,
        order_index: row.order_index,
        is_required: row.is_required,
        field: row.field as unknown as FieldDefinition,
      }))
    },
  })

  // Все поля воркспейса — для библиотеки
  const { data: allFields = [] } = useQuery({
    queryKey: fieldDefinitionKeys.byWorkspace(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definitions')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })
      if (error) throw error
      return data as FieldDefinition[]
    },
  })

  const candidates = useMemo(() => {
    const taken = new Set(linked.map((l) => l.field.id))
    return allFields.filter((f) => !taken.has(f.id) && f.field_type !== 'divider')
  }, [allFields, linked])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: linksKey })
  }

  // Подключение существующих полей из справочника
  const linkMutation = useMutation({
    mutationFn: async (fieldIds: string[]) => {
      const baseOrder = linked.length
      const rows = fieldIds.map((id, i) => ({
        template_id: projectTemplateId,
        field_definition_id: id,
        order_index: baseOrder + i,
        is_required: false,
      }))
      const { error } = await supabase.from('project_template_field_links').insert(rows)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Поля добавлены')
      invalidate()
      setIsLibraryOpen(false)
      setLibrarySelected(new Set())
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось добавить'),
  })

  // Отвязка поля от шаблона
  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('project_template_field_links')
        .delete()
        .eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Поле убрано из шаблона')
      invalidate()
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Не удалось убрать'),
  })

  // Переключение обязательности
  const toggleRequiredMutation = useMutation({
    mutationFn: async ({ linkId, isRequired }: { linkId: string; isRequired: boolean }) => {
      const { error } = await supabase
        .from('project_template_field_links')
        .update({ is_required: isRequired })
        .eq('id', linkId)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
    onError: () => {
      toast.error('Не удалось обновить флаг')
      invalidate()
    },
  })

  // Перестановка вверх/вниз
  const reorderMutation = useMutation({
    mutationFn: async (newOrder: LinkedField[]) => {
      const updates = newOrder.map((l, i) =>
        supabase
          .from('project_template_field_links')
          .update({ order_index: i })
          .eq('id', l.link_id),
      )
      const results = await Promise.all(updates)
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onError: () => {
      toast.error('Не удалось изменить порядок')
      invalidate()
    },
    onSuccess: () => invalidate(),
  })

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= linked.length) return
    const next = [...linked]
    ;[next[index], next[target]] = [next[target], next[index]]
    reorderMutation.mutate(next)
  }

  const handleRemove = async (l: LinkedField) => {
    const ok = await confirm({
      title: 'Убрать поле из шаблона?',
      description: `Поле «${l.field.name}» будет убрано из проектов этого типа. В справочнике поле останется.`,
      variant: 'destructive',
      confirmText: 'Убрать',
    })
    if (!ok) return
    unlinkMutation.mutate(l.link_id)
  }

  // Когда новое поле создано — автоматически добавляем его в шаблон
  const handleNewFieldCreated = async () => {
    queryClient.invalidateQueries({ queryKey: fieldDefinitionKeys.byWorkspace(workspaceId) })
    // Подождём немного и подцепим самое свежее по created_at
    const { data } = await supabase
      .from('field_definitions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
    if (data && data[0]) {
      const fresh = data[0] as FieldDefinition
      const alreadyLinked = linked.some((l) => l.field.id === fresh.id)
      if (!alreadyLinked) {
        linkMutation.mutate([fresh.id])
      }
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg">Поля</CardTitle>
          <CardDescription>
            {linked.length === 0
              ? 'Кастомных полей пока нет — карточка проекта будет без блока «Поля»'
              : `${linked.length} поле(й) в этом шаблоне`}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setIsLibraryOpen(true)}>
            <Library className="h-4 w-4 mr-1" />
            Из справочника
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditingField(null)
              setIsCreateOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Создать
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading || linked.length === 0 ? (
          <EmptyState
            loading={isLoading}
            emptyText="Добавьте поля — они появятся в карточке проектов этого типа."
          />
        ) : (
          <div className="space-y-1">
            {linked.map((l, index) => (
              <div
                key={l.link_id}
                className="flex items-center gap-2 px-2 py-1.5 rounded border hover:bg-muted/40"
              >
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={index === 0 || reorderMutation.isPending}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    disabled={index === linked.length - 1 || reorderMutation.isPending}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
                <span className="flex-1 text-sm font-medium">{l.field.name}</span>
                <Badge variant="outline" className="text-xs">
                  {FIELD_TYPE_LABELS[l.field.field_type] ?? l.field.field_type}
                </Badge>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox
                    checked={l.is_required}
                    onCheckedChange={(v) =>
                      toggleRequiredMutation.mutate({
                        linkId: l.link_id,
                        isRequired: v === true,
                      })
                    }
                  />
                  Обязательное
                </label>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingField(l.field)
                    setIsCreateOpen(true)
                  }}
                  title="Редактировать поле"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleRemove(l)}
                  disabled={unlinkMutation.isPending}
                  title="Убрать из шаблона"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      {/* Диалог библиотеки полей */}
      <Dialog open={isLibraryOpen} onOpenChange={setIsLibraryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Добавить поля из справочника</DialogTitle>
            <DialogDescription>
              Отметьте поля, которые нужно подключить к этому шаблону. Они появятся в карточке
              проектов этого типа.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto py-2">
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Все доступные поля уже подключены к этому шаблону.
              </p>
            ) : (
              <div className="space-y-1">
                {candidates.map((f) => {
                  const checked = librarySelected.has(f.id)
                  return (
                    <label
                      key={f.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => {
                          setLibrarySelected((prev) => {
                            const next = new Set(prev)
                            if (next.has(f.id)) next.delete(f.id)
                            else next.add(f.id)
                            return next
                          })
                        }}
                      />
                      <span className="text-sm flex-1">{f.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {FIELD_TYPE_LABELS[f.field_type] ?? f.field_type}
                      </Badge>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsLibraryOpen(false)
                setLibrarySelected(new Set())
              }}
              disabled={linkMutation.isPending}
            >
              Отмена
            </Button>
            <Button
              onClick={() => linkMutation.mutate(Array.from(librarySelected))}
              disabled={linkMutation.isPending || librarySelected.size === 0}
            >
              {linkMutation.isPending ? 'Добавление…' : `Добавить (${librarySelected.size})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Диалог создания / редактирования поля */}
      <FieldDefinitionDialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open)
          if (!open && !editingField) {
            // Только что создали новое поле — автоматом добавим его в шаблон
            handleNewFieldCreated()
          }
          if (!open) setEditingField(null)
        }}
        field={editingField}
        workspaceId={workspaceId}
      />
    </Card>
  )
}
