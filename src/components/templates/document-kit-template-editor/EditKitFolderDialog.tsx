/**
 * EditKitFolderDialog — диалог создания/редактирования папки в шаблоне набора.
 *
 * Все поля на одном экране, источник описания — обычные радио (Текст / Статья БЗ),
 * AI-промпты секцией ниже.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KitFolder } from './types'
import { SlotsEditor } from '../SlotsEditor'
import { documentKitTemplateKeys } from '@/hooks/queryKeys'
import {
  ArticleTreePicker,
  type ArticleTreePickerGroup,
  type ArticleTreePickerLink,
} from '../ArticleTreePicker'

interface EditKitFolderDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  folder?: KitFolder | null
  isPending: boolean
  articles?: Array<{ id: string; title: string }>
  groups?: ArticleTreePickerGroup[]
  articleGroups?: ArticleTreePickerLink[]
  onSubmit: (data: {
    id?: string
    name: string
    description?: string | null
    ai_naming_prompt?: string | null
    ai_check_prompt?: string | null
    knowledge_article_id?: string | null
  }) => void
}

export function EditKitFolderDialog({
  open,
  onOpenChange,
  folder,
  isPending,
  articles = [],
  groups = [],
  articleGroups = [],
  onSubmit,
}: EditKitFolderDialogProps) {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [name, setName] = useState(folder?.name || '')
  const [description, setDescription] = useState(folder?.description || '')
  const [aiNamingPrompt, setAiNamingPrompt] = useState(folder?.ai_naming_prompt || '')
  const [aiCheckPrompt, setAiCheckPrompt] = useState(folder?.ai_check_prompt || '')
  const [knowledgeArticleId, setKnowledgeArticleId] = useState<string | null>(
    folder?.knowledge_article_id || null,
  )
  const [descriptionMode, setDescriptionMode] = useState<'text' | 'article'>(
    folder?.knowledge_article_id ? 'article' : 'text',
  )

  const isEditing = !!folder

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return

    onSubmit({
      id: folder?.id,
      name: trimmed,
      description: descriptionMode === 'text' ? description.trim() || null : null,
      ai_naming_prompt: aiNamingPrompt.trim() || null,
      ai_check_prompt: aiCheckPrompt.trim() || null,
      knowledge_article_id: descriptionMode === 'article' ? knowledgeArticleId : null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Редактировать папку' : 'Создать папку'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Название</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Название папки"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Описание для клиента</Label>
            {articles.length > 0 && (
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="kit-folder-description-mode"
                    checked={descriptionMode === 'text'}
                    onChange={() => {
                      setDescriptionMode('text')
                      setKnowledgeArticleId(null)
                    }}
                  />
                  Текст
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="kit-folder-description-mode"
                    checked={descriptionMode === 'article'}
                    onChange={() => setDescriptionMode('article')}
                  />
                  Статья базы знаний
                </label>
              </div>
            )}

            {descriptionMode === 'text' ? (
              <Textarea
                id="folder-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Описание папки (необязательно)"
                rows={3}
              />
            ) : (
              <ArticleTreePicker
                articles={articles}
                groups={groups}
                articleGroups={articleGroups}
                selectedId={knowledgeArticleId}
                onSelect={setKnowledgeArticleId}
              />
            )}
          </div>

          {isEditing && folder?.id && (
            <div className="space-y-2">
              <Label>Слоты документов</Label>
              <SlotsEditor
                config={{
                  table: 'document_kit_template_folder_slots',
                  foreignKey: 'kit_folder_id',
                  foreignKeyValue: folder.id,
                  queryKey: documentKitTemplateKeys.kitFolderSlots(folder.id),
                }}
                workspaceId={workspaceId}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="folder-ai-naming">AI-промпт для именования</Label>
              <Textarea
                id="folder-ai-naming"
                value={aiNamingPrompt}
                onChange={(e) => setAiNamingPrompt(e.target.value)}
                placeholder="Промпт для AI-именования документов (необязательно)"
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-ai-check">AI-промпт для проверки</Label>
              <Textarea
                id="folder-ai-check"
                value={aiCheckPrompt}
                onChange={(e) => setAiCheckPrompt(e.target.value)}
                placeholder="Промпт для AI-проверки документов (необязательно)"
                rows={6}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isPending}>
            {isPending ? 'Сохранение...' : isEditing ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
