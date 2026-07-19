/**
 * SlotTemplatePickerDialog — выбор шаблонов слотов из справочника.
 *
 * Мультивыбор: отмечаешь нужные и добавляешь разом. onPick отдаёт поля выбранных
 * шаблонов, вызывающий копирует их в инлайн-слоты (folder_template_slots или
 * document_kit_template_folder_slots) — не live-reference, дальнейшие правки
 * справочника на созданные слоты не влияют.
 *
 * Порядок списка — как в справочнике (см. useSlotTemplates).
 */

import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { slotTemplatesKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Search, Package, BookOpen, Plus } from 'lucide-react'
import { PageLoader } from '@/components/ui/loaders'
import { CommentNote } from './CommentNote'
import { EditSlotDialog, type SlotDialogValue } from './EditSlotDialog'
import { useSlotTemplates, insertSlotTemplate, type SlotTemplate } from './useSlotTemplates'
import {
  type ArticleTreePickerGroup,
  type ArticleTreePickerLink,
} from './ArticleTreePicker'
import { cn } from '@/lib/utils'

export type PickedSlotTemplate = {
  name: string
  description: string | null
  knowledge_article_id: string | null
  ai_naming_prompt: string | null
  ai_check_prompt: string | null
  /** id шаблона слота (справочник) — для обратной ссылки slot_template_id. */
  slot_template_id: string
}

type SlotTemplatePickerDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  /** Имена слотов, уже добавленных в эту папку — их выбрать нельзя. */
  existingNames?: string[]
  /** Для ArticleTreePicker внутри формы создания шаблона. */
  articles?: Array<{ id: string; title: string }>
  groups?: ArticleTreePickerGroup[]
  articleGroups?: ArticleTreePickerLink[]
  onPick: (picked: PickedSlotTemplate[]) => void
}

const toPicked = (t: SlotTemplate): PickedSlotTemplate => ({
  name: t.name,
  description: t.description,
  knowledge_article_id: t.knowledge_article_id,
  ai_naming_prompt: t.ai_naming_prompt,
  ai_check_prompt: t.ai_check_prompt,
  slot_template_id: t.id,
})

export function SlotTemplatePickerDialog({
  open,
  onOpenChange,
  workspaceId,
  existingNames = [],
  articles = [],
  groups = [],
  articleGroups = [],
  onPick,
}: SlotTemplatePickerDialogProps) {
  const queryClient = useQueryClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  const { data: templates = [], isLoading } = useSlotTemplates(workspaceId, open)

  // Слот в папке — копия шаблона без ссылки на источник, поэтому «уже добавлен»
  // определяется только по имени.
  const existing = useMemo(
    () => new Set(existingNames.map((n) => n.trim().toLowerCase())),
    [existingNames],
  )

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return templates
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q),
    )
  }, [templates, searchQuery])

  const createTemplateMutation = useMutation({
    mutationFn: (data: SlotDialogValue) => insertSlotTemplate(workspaceId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: slotTemplatesKeys.byWorkspace(workspaceId) })
      setIsCreateOpen(false)
    },
    onError: (error) => {
      logger.error('Ошибка создания шаблона слота:', error)
      toast.error('Не удалось создать шаблон слота')
    },
  })

  const toggle = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]))
  }

  const close = () => {
    onOpenChange(false)
    setSelectedIds([])
    setSearchQuery('')
  }

  const handleSubmit = () => {
    if (selectedIds.length === 0) return
    // Порядок добавления — как в справочнике, а не как кликали.
    const picked = templates.filter((t) => selectedIds.includes(t.id)).map(toPicked)
    onPick(picked)
    close()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Добавить слоты из справочника</DialogTitle>
            <DialogDescription>
              Поля шаблона скопируются в новые слоты. Потом их можно будет изменить
              независимо — изменения в справочнике на эти слоты не повлияют.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Поиск по названию, описанию..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Создать
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6">
            {isLoading ? (
              <PageLoader />
            ) : filtered.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                {searchQuery
                  ? 'Ничего не найдено'
                  : 'Справочник пуст. Создайте первый шаблон слота кнопкой «Создать».'}
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((t) => {
                  const isAdded = existing.has(t.name.trim().toLowerCase())
                  const isChecked = selectedIds.includes(t.id)
                  return (
                    <li key={t.id}>
                      <label
                        className={cn(
                          'flex items-center gap-2.5 px-2 py-1.5 rounded-md',
                          isAdded
                            ? 'opacity-50 cursor-not-allowed'
                            : 'cursor-pointer hover:bg-muted/60',
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          disabled={isAdded}
                          onCheckedChange={() => toggle(t.id)}
                        />
                        <Package className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="text-sm font-medium truncate flex-shrink-0 max-w-[45%]">
                          {t.name}
                        </span>
                        <CommentNote comment={t.comment} />
                        {isAdded ? (
                          <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                            уже добавлен
                          </span>
                        ) : t.knowledge_article_id ? (
                          <span
                            title="Описание из статьи базы знаний"
                            className="flex-shrink-0 ml-auto"
                          >
                            <BookOpen className="h-3.5 w-3.5 text-blue-500" />
                          </span>
                        ) : t.description ? (
                          <span className="text-xs text-muted-foreground truncate ml-auto">
                            {t.description}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Отмена
            </Button>
            <Button onClick={handleSubmit} disabled={selectedIds.length === 0}>
              {selectedIds.length > 0 ? `Добавить (${selectedIds.length})` : 'Добавить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditSlotDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        title="Создать шаблон слота"
        withComment
        isPending={createTemplateMutation.isPending}
        articles={articles}
        groups={groups}
        articleGroups={articleGroups}
        onSubmit={(data) => createTemplateMutation.mutate(data)}
      />
    </>
  )
}
