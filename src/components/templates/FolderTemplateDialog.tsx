/**
 * FolderTemplateDialog — диалог создания/редактирования шаблона папки
 *
 * Извлечён из FolderTemplatesContent (B-68 SRP refactoring).
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { SlotsEditor } from './SlotsEditor'
import {
  ArticleTreePicker,
  type ArticleTreePickerGroup,
  type ArticleTreePickerLink,
} from './ArticleTreePicker'

type FolderTemplate = Database['public']['Tables']['folder_templates']['Row']

export interface FolderFormData {
  name: string
  description: string
  ai_naming_prompt: string
  ai_check_prompt: string
  knowledge_article_id: string | null
}

interface FolderTemplateDialogProps {
  open: boolean
  onClose: () => void
  editingTemplate: FolderTemplate | null
  formData: FolderFormData
  setFormData: (data: FolderFormData) => void
  onSubmit: (e: React.FormEvent) => void
  isSaving: boolean
  activeTab: string
  setActiveTab: (tab: string) => void
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
  activeTab,
  setActiveTab,
  articles,
  groups,
  articleGroups,
  workspaceId,
}: FolderTemplateDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh]">
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
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Название *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Например: Паспорта, Договоры, Банковские документы"
                className="text-2xl font-bold !text-2xl h-12 py-2"
                required
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="w-auto">
                <TabsTrigger value="description">Описание</TabsTrigger>
                {editingTemplate && <TabsTrigger value="slots">Слоты</TabsTrigger>}
                <TabsTrigger value="naming-prompt">AI промпт для названия</TabsTrigger>
                <TabsTrigger value="check-prompt">AI промпт для проверки</TabsTrigger>
              </TabsList>

              <TabsContent value="description" className="mt-4">
                <div className="space-y-4">
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
                        Привязанная статья будет отображаться как описание папки
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
                        placeholder="Краткое описание назначения папки"
                        rows={10}
                        className="min-h-[300px]"
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              {editingTemplate && workspaceId && (
                <TabsContent value="slots" className="mt-4">
                  <SlotsEditor
                    config={{
                      table: 'folder_template_slots',
                      foreignKey: 'folder_template_id',
                      foreignKeyValue: editingTemplate.id,
                      queryKey: ['folder-template-slots', editingTemplate.id],
                      extraInsertFields: { workspace_id: workspaceId },
                    }}
                    description="Слоты — это предопределённые места для документов. При создании папки из шаблона слоты будут автоматически добавлены."
                  />
                </TabsContent>
              )}

              <TabsContent value="naming-prompt" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="ai_naming_prompt">
                    AI промпт для названия документа (опционально)
                  </Label>
                  <Textarea
                    id="ai_naming_prompt"
                    value={formData.ai_naming_prompt}
                    onChange={(e) => setFormData({ ...formData, ai_naming_prompt: e.target.value })}
                    placeholder="Промпт для генерации вариантов названия документа"
                    rows={10}
                    className="min-h-[300px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Укажите, как AI должен формировать название документа на основе его содержимого
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="check-prompt" className="mt-4">
                <div className="space-y-2">
                  <Label htmlFor="ai_check_prompt">
                    AI промпт для проверки документа (опционально)
                  </Label>
                  <Textarea
                    id="ai_check_prompt"
                    value={formData.ai_check_prompt}
                    onChange={(e) => setFormData({ ...formData, ai_check_prompt: e.target.value })}
                    placeholder="Промпт для проверки содержимого документа"
                    rows={10}
                    className="min-h-[300px]"
                  />
                  <p className="text-xs text-muted-foreground">
                    Укажите, как AI должен проверять и анализировать содержимое документа
                  </p>
                </div>
              </TabsContent>
            </Tabs>
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
