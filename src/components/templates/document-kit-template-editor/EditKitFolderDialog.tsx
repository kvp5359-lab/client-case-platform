/**
 * EditKitFolderDialog — диалог создания/редактирования папки в шаблоне набора
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KitFolder } from './types'
import { SlotsEditor } from '../SlotsEditor'
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Редактировать папку' : 'Создать папку'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
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

          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">Основное</TabsTrigger>
              <TabsTrigger value="prompts">AI-промпты</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Описание для клиента</Label>
                <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg w-fit">
                  <button
                    type="button"
                    className={`px-3 py-1 text-sm rounded-md transition-colors ${
                      descriptionMode === 'text'
                        ? 'bg-background shadow text-foreground font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => {
                      setDescriptionMode('text')
                      setKnowledgeArticleId(null)
                    }}
                  >
                    Текст
                  </button>
                  {articles.length > 0 && (
                    <button
                      type="button"
                      className={`px-3 py-1 text-sm rounded-md transition-colors ${
                        descriptionMode === 'article'
                          ? 'bg-background shadow text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setDescriptionMode('article')}
                    >
                      Статья базы знаний
                    </button>
                  )}
                </div>

                {descriptionMode === 'text' ? (
                  <Textarea
                    id="folder-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Описание папки (необязательно)"
                    rows={2}
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
                      queryKey: ['kit-folder-slots', folder.id],
                    }}
                    workspaceId={workspaceId}
                  />
                </div>
              )}
            </TabsContent>

            <TabsContent value="prompts" className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="folder-ai-naming">AI-промпт для именования</Label>
                  <Textarea
                    id="folder-ai-naming"
                    value={aiNamingPrompt}
                    onChange={(e) => setAiNamingPrompt(e.target.value)}
                    placeholder="Промпт для AI-именования документов (необязательно)"
                    rows={12}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="folder-ai-check">AI-промпт для проверки</Label>
                  <Textarea
                    id="folder-ai-check"
                    value={aiCheckPrompt}
                    onChange={(e) => setAiCheckPrompt(e.target.value)}
                    placeholder="Промпт для AI-проверки документов (необязательно)"
                    rows={12}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>
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
