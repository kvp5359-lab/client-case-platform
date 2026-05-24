"use client"

/**
 * BoardFilterDialog — редактор фильтра на уровне всей доски (этап 4.1 CRM-фрейма).
 *
 * Хранит две независимые группы — для проектов и для тасков. Inbox-списки
 * board-level фильтр игнорируют (у них своя логика default_filter).
 *
 * На рендере доски board.global_filter[entity_type] комбинируется AND
 * с list.filters в BoardListCard.
 */

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilterGroupEditor } from '@/components/filters/FilterGroupEditor'
import { useUpdateBoard } from './hooks/useBoardMutations'
import {
  EMPTY_BOARD_GLOBAL_FILTER,
  normalizeBoardGlobalFilter,
  type Board,
  type BoardGlobalFilter,
} from './types'
import type { FilterGroup } from '@/lib/filters/types'

type BoardFilterDialogProps = {
  open: boolean
  onClose: () => void
  board: Board
}

export function BoardFilterDialog({ open, onClose, board }: BoardFilterDialogProps) {
  const updateBoard = useUpdateBoard()
  const [draft, setDraft] = useState<BoardGlobalFilter>(EMPTY_BOARD_GLOBAL_FILTER)

  // Инициализируем драфт при открытии диалога. Если в data есть мусор —
  // normalize вернёт корректную структуру.
  useEffect(() => {
    if (open) {
      // queueMicrotask избегает cascading render — обновление состояния
      // происходит после завершения текущего render commit'а.
      queueMicrotask(() => setDraft(normalizeBoardGlobalFilter(board.global_filter)))
    }
  }, [open, board.global_filter])

  const handleProjectChange = (next: FilterGroup) => {
    setDraft((prev) => ({ ...prev, project: next }))
  }

  const handleThreadChange = (next: FilterGroup) => {
    setDraft((prev) => ({ ...prev, thread: next }))
  }

  const handleSave = () => {
    updateBoard.mutate(
      {
        id: board.id,
        workspace_id: board.workspace_id,
        global_filter: draft,
      },
      {
        onSuccess: () => {
          toast.success('Фильтр доски сохранён')
          onClose()
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : 'Не удалось сохранить фильтр')
        },
      },
    )
  }

  const handleClear = (entity: 'project' | 'thread') => {
    setDraft((prev) => ({ ...prev, [entity]: { logic: 'and', rules: [] } }))
  }

  const projectRulesCount = draft.project.rules.length
  const threadRulesCount = draft.thread.rules.length

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Фильтр доски «{board.name}»</DialogTitle>
          <DialogDescription>
            Фильтр применяется ко всем спискам доски соответствующего типа сразу. Фильтры
            конкретных списков продолжают работать поверх — комбинируются через И.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="project" className="mt-2">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="project">
              Проекты {projectRulesCount > 0 && <span className="ml-1.5 text-xs opacity-70">({projectRulesCount})</span>}
            </TabsTrigger>
            <TabsTrigger value="thread">
              Задачи {threadRulesCount > 0 && <span className="ml-1.5 text-xs opacity-70">({threadRulesCount})</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project" className="space-y-2 pt-3 max-h-[60vh] overflow-y-auto">
            <FilterGroupEditor
              group={draft.project}
              onChange={handleProjectChange}
              entityType="project"
              depth={0}
              workspaceId={board.workspace_id}
            />
            {projectRulesCount > 0 && (
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => handleClear('project')}>
                  Очистить фильтр для проектов
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="thread" className="space-y-2 pt-3 max-h-[60vh] overflow-y-auto">
            <FilterGroupEditor
              group={draft.thread}
              onChange={handleThreadChange}
              entityType="thread"
              depth={0}
              workspaceId={board.workspace_id}
            />
            {threadRulesCount > 0 && (
              <div className="flex justify-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => handleClear('thread')}>
                  Очистить фильтр для задач
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={updateBoard.isPending}>
            Отмена
          </Button>
          <Button type="button" onClick={handleSave} disabled={updateBoard.isPending}>
            {updateBoard.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
