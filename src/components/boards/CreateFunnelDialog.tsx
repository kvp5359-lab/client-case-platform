"use client"

/**
 * CreateFunnelDialog — авто-генерация воронки на доске (этап 4.5 CRM-фрейма).
 *
 * Создаёт по одному board_list на каждый статус выбранного шаблона проекта.
 * Каждый список фильтруется на template_id + status_id, размещается в своей
 * горизонтальной колонке и наследует цвет статуса в header_color.
 *
 * После генерации воронка готова к работе: drag-n-drop карточек между
 * списками меняет статус (см. cross-list DnD в BoardView).
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Database } from '@/types/database'

type BoardListInsert = Database['public']['Tables']['board_lists']['Insert']
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Target } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useProjectStatusesForTemplate } from '@/hooks/useStatuses'
import { boardKeys, templatesForRoutingKeys } from '@/hooks/queryKeys'
import type { FilterGroup } from '@/lib/filters/types'

type Props = {
  open: boolean
  onClose: () => void
  workspaceId: string
  boardId: string
  /** Уже существующие на доске column_index'ы — чтобы новые колонки воронки
   *  встали правее, не пересекаясь. */
  existingColumnsCount: number
}

type ProjectTemplateRow = {
  id: string
  name: string
  is_lead_template: boolean
}

export function CreateFunnelDialog({
  open,
  onClose,
  workspaceId,
  boardId,
  existingColumnsCount,
}: Props) {
  const queryClient = useQueryClient()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // Сбрасываем выбор при открытии диалога.
  useEffect(() => {
    if (open) queueMicrotask(() => setSelectedTemplateId(null))
  }, [open])

  // Все шаблоны проектов воркспейса. Лид-шаблоны помечаем визуально, но
  // воронку можно создать для любого — это валидно для рабочих процессов
  // (например, «Этапы ВНЖ»).
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: templatesForRoutingKeys.forFunnel(workspaceId),
    queryFn: async (): Promise<ProjectTemplateRow[]> => {
      const { data, error } = await supabase
        .from('project_templates')
        .select('id, name, is_lead_template')
        .eq('workspace_id', workspaceId)
        .order('is_lead_template', { ascending: false })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []) as ProjectTemplateRow[]
    },
    enabled: open && !!workspaceId,
  })

  // Статусы выбранного шаблона — превью того, какие колонки будут созданы.
  const { data: statuses = [], isLoading: statusesLoading } =
    useProjectStatusesForTemplate(workspaceId, selectedTemplateId)

  const sortedStatuses = useMemo(
    () => [...statuses].sort((a, b) => a.order_index - b.order_index),
    [statuses],
  )

  const createMut = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId || sortedStatuses.length === 0) {
        throw new Error('Выберите шаблон со статусами')
      }
      // По одному списку на каждый статус. Каждый — в свою колонку правее
      // существующих, чтобы не пересекаться с тем что уже на доске.
      const rows = sortedStatuses.map((s, i) => {
        const filter: FilterGroup = {
          logic: 'and',
          rules: [
            {
              type: 'condition',
              field: 'template_id',
              operator: 'in',
              value: [selectedTemplateId],
            },
            {
              type: 'condition',
              field: 'status_id',
              operator: 'in',
              value: [s.id],
            },
          ],
        }
        return {
          board_id: boardId,
          name: s.name,
          entity_type: 'project',
          column_index: existingColumnsCount + i,
          sort_order: 0,
          filters: filter,
          group_by: 'none',
          display_mode: 'cards',
          sort_by: 'created_at',
          sort_dir: 'desc',
          header_color: s.color,
        }
      })
      // FilterGroup имеет интерфейсный тип, а Supabase Insert ждёт чистый Json
      // (запись с index signature). Структура совместима — каст безопасен.
      const { error } = await supabase
        .from('board_lists')
        .insert(rows as unknown as BoardListInsert[])
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: boardKeys.lists(boardId) })
      toast.success(`Создано колонок: ${sortedStatuses.length}`)
      onClose()
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось создать воронку')
    },
  })

  const selectedTemplateName = templates.find((t) => t.id === selectedTemplateId)?.name

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-4" />
            Создать воронку из шаблона
          </DialogTitle>
          <DialogDescription>
            Под каждый статус выбранного шаблона появится отдельная колонка-список.
            Карточки можно будет таскать между ними — статус меняется автоматически.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="funnel-template">Шаблон проекта</Label>
            {templatesLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="size-3 animate-spin" /> Загрузка шаблонов…
              </div>
            ) : (
              <Select
                value={selectedTemplateId ?? ''}
                onValueChange={(v) => setSelectedTemplateId(v || null)}
              >
                <SelectTrigger id="funnel-template">
                  <SelectValue placeholder="Выбери шаблон" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        {t.name}
                        {t.is_lead_template && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                            Лид
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Превью статусов — что будет создано */}
          {selectedTemplateId && (
            <div className="space-y-2">
              <Label>Будут созданы колонки:</Label>
              {statusesLoading ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" /> Загрузка статусов…
                </div>
              ) : sortedStatuses.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                  У этого шаблона нет статусов. Сначала добавь их в редакторе шаблона.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sortedStatuses.map((s) => (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium"
                      style={{
                        backgroundColor: `${s.color}1A`,
                        color: s.color,
                      }}
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={createMut.isPending}>
            Отмена
          </Button>
          <Button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={
              createMut.isPending ||
              !selectedTemplateId ||
              sortedStatuses.length === 0
            }
          >
            {createMut.isPending
              ? 'Создание…'
              : selectedTemplateName
              ? `Создать ${sortedStatuses.length} колонок`
              : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
