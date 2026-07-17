/**
 * FolderTemplateDialog — диалог создания/редактирования шаблона папки.
 *
 * Все поля на одном экране (без вкладок), переключатель «Текст / Статья БЗ»
 * для источника описания — обычные радио. Слоты, AI-промпты — секциями ниже.
 */

import { useState } from 'react'
import { Database } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NameWithCommentField } from './NameWithCommentField'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { SlotsEditor } from './SlotsEditor'
import { folderTemplateSlotKeys } from '@/hooks/queryKeys'
import {
  ArticleTreePicker,
  type ArticleTreePickerGroup,
  type ArticleTreePickerLink,
} from './ArticleTreePicker'

type FolderTemplate = Database['public']['Tables']['folder_templates']['Row']

export type FolderFormData = {
  name: string
  comment: string
  description: string
  ai_naming_prompt: string
  ai_check_prompt: string
  knowledge_article_id: string | null
}

type FolderTemplateDialogProps = {
  open: boolean
  onClose: () => void
  editingTemplate: FolderTemplate | null
  formData: FolderFormData
  setFormData: (data: FolderFormData) => void
  onSubmit: (e: React.FormEvent) => void
  isSaving: boolean
  articles: Array<{ id: string; title: string }>
  groups: ArticleTreePickerGroup[]
  articleGroups: ArticleTreePickerLink[]
  workspaceId: string | undefined
}

export function FolderTemplateDialog({
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
  workspaceId,
}: FolderTemplateDialogProps) {
  // Локальный режим — независим от formData.knowledge_article_id, чтобы
  // переключение на «Статья БЗ» работало даже когда статья ещё не выбрана.
  const [descriptionMode, setDescriptionMode] = useState<'text' | 'article'>(
    formData.knowledge_article_id ? 'article' : 'text',
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingTemplate ? 'Редактировать шаблон папки' : 'Создать шаблон папки'}
          </DialogTitle>
          <DialogDescription>
            {editingTemplate
              ? 'Измените данные шаблона папки'
              : 'Заполните данные для нового шаблона папки'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit}>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <NameWithCommentField
                nameId="name"
                name={formData.name}
                comment={formData.comment}
                onNameChange={(value) => setFormData({ ...formData, name: value })}
                onCommentChange={(value) => setFormData({ ...formData, comment: value })}
                required
              />
            </div>

            <div
              className={
                editingTemplate && workspaceId
                  ? 'grid grid-cols-[65fr_35fr] gap-4 items-start'
                  : ''
              }
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label>Описание для клиента</Label>
                  {articles.length > 0 && (
                    <div className="flex items-center gap-4 text-sm">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="folder-description-mode"
                          checked={descriptionMode === 'text'}
                          onChange={() => {
                            setDescriptionMode('text')
                            setFormData({ ...formData, knowledge_article_id: null })
                          }}
                        />
                        Текст
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="folder-description-mode"
                          checked={descriptionMode === 'article'}
                          onChange={() => setDescriptionMode('article')}
                        />
                        Статья базы знаний
                      </label>
                    </div>
                  )}

                  {descriptionMode === 'text' ? (
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Краткое описание назначения папки"
                      rows={4}
                    />
                  ) : (
                    <ArticleTreePicker
                      articles={articles}
                      groups={groups}
                      articleGroups={articleGroups}
                      selectedId={formData.knowledge_article_id}
                      onSelect={(id) => setFormData({ ...formData, knowledge_article_id: id })}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai_naming_prompt">AI-промпт для именования</Label>
                  <Textarea
                    id="ai_naming_prompt"
                    value={formData.ai_naming_prompt}
                    onChange={(e) =>
                      setFormData({ ...formData, ai_naming_prompt: e.target.value })
                    }
                    placeholder="Как AI должен формировать название документа"
                    rows={5}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai_check_prompt">AI-промпт для проверки</Label>
                  <Textarea
                    id="ai_check_prompt"
                    value={formData.ai_check_prompt}
                    onChange={(e) =>
                      setFormData({ ...formData, ai_check_prompt: e.target.value })
                    }
                    placeholder="Как AI должен проверять содержимое документа"
                    rows={5}
                  />
                </div>
              </div>

              {editingTemplate && workspaceId && (
                <div className="space-y-2">
                  <Label>Слоты документов</Label>
                  <SlotsEditor
                    config={{
                      table: 'folder_template_slots',
                      foreignKey: 'folder_template_id',
                      foreignKeyValue: editingTemplate.id,
                      queryKey: folderTemplateSlotKeys.byTemplate(editingTemplate.id),
                      extraInsertFields: { workspace_id: workspaceId },
                    }}
                    workspaceId={workspaceId}
                    layout="list"
                  />
                </div>
              )}
            </div>
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
