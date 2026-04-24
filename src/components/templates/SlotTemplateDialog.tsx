/**
 * SlotTemplateDialog — создание/редактирование шаблона слота.
 * Простая форма: название + описание (текст или ссылка на статью БЗ).
 */

import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  ArticleTreePicker,
  type ArticleTreePickerGroup,
  type ArticleTreePickerLink,
} from './ArticleTreePicker'

type SlotTemplate = Database['public']['Tables']['slot_templates']['Row']

export interface SlotTemplateFormData {
  name: string
  description: string
  knowledge_article_id: string | null
}

interface SlotTemplateDialogProps {
  open: boolean
  onClose: () => void
  editingTemplate: SlotTemplate | null
  formData: SlotTemplateFormData
  setFormData: (data: SlotTemplateFormData) => void
  onSubmit: (e: React.FormEvent) => void
  isSaving: boolean
  articles: Array<{ id: string; title: string }>
  groups: ArticleTreePickerGroup[]
  articleGroups: ArticleTreePickerLink[]
}

export function SlotTemplateDialog({
  open,
  onClose,
  editingTemplate,
  formData,
  setFormData,
  onSubmit,
  isSaving,
  articles,
  groups,
  articleGroups,
}: SlotTemplateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>
            {editingTemplate ? 'Редактировать шаблон слота' : 'Создать шаблон слота'}
          </DialogTitle>
          <DialogDescription>
            Типовая заготовка слота. При добавлении в шаблон папки или набора документов
            поля копируются — изменения в справочнике не затрагивают старые подключения.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Например: Загранпаспорт, Диплом об образовании"
                className="text-lg font-semibold h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Статья базы знаний</Label>
              <ArticleTreePicker
                articles={articles}
                groups={groups}
                articleGroups={articleGroups}
                selectedId={formData.knowledge_article_id}
                onSelect={(id) => setFormData({ ...formData, knowledge_article_id: id })}
              />
              {formData.knowledge_article_id && (
                <p className="text-xs text-muted-foreground">
                  Привязанная статья будет показана по клику на «?» рядом со слотом.
                </p>
              )}
            </div>

            {!formData.knowledge_article_id && (
              <div className="space-y-2">
                <Label htmlFor="description">Текстовое описание</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Требования к документу, пояснения для пользователя"
                  rows={8}
                  className="min-h-[180px]"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? editingTemplate
                  ? 'Сохранение...'
                  : 'Создание...'
                : editingTemplate
                  ? 'Сохранить'
                  : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
