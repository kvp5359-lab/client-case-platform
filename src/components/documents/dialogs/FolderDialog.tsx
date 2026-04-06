"use client"

/**
 * Диалог создания/редактирования папки
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { NameInput } from '@/components/ui/name-input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import type { DialogBaseProps } from '@/types'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { getArticlesByWorkspace } from '@/services/api/knowledge/knowledgeBaseService'
import { supabase } from '@/lib/supabase'
import { ArticleTreePicker } from '@/components/templates/ArticleTreePicker'

interface FolderDialogProps extends DialogBaseProps {
  isEditing: boolean
  name: string
  description: string
  aiNamingPrompt?: string
  aiCheckPrompt?: string
  knowledgeArticleId?: string | null
  workspaceId?: string
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onAiNamingPromptChange?: (prompt: string) => void
  onAiCheckPromptChange?: (prompt: string) => void
  onKnowledgeArticleChange?: (articleId: string | null) => void
  onSave: () => void
  isSaving: boolean
}

export function FolderDialog({
  open,
  onOpenChange,
  isEditing,
  name,
  description,
  aiNamingPrompt = '',
  aiCheckPrompt = '',
  knowledgeArticleId,
  workspaceId,
  onNameChange,
  onDescriptionChange,
  onAiNamingPromptChange,
  onAiCheckPromptChange,
  onKnowledgeArticleChange,
  onSave,
  isSaving,
}: FolderDialogProps) {
  const [activeTab, setActiveTab] = useState('description')

  const { data: articles = [] } = useQuery({
    queryKey: knowledgeBaseKeys.articles(workspaceId!),
    queryFn: () => getArticlesByWorkspace(workspaceId!),
    enabled: !!workspaceId && open,
  })

  const { data: groups = [] } = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return data || []
    },
    enabled: !!workspaceId && open,
  })

  const { data: articleGroups = [] } = useQuery({
    queryKey: ['knowledge-article-groups', workspaceId],
    queryFn: async () => {
      // Фильтруем через join с knowledge_groups для ограничения по workspace
      const { data, error } = await supabase
        .from('knowledge_article_groups')
        .select('article_id, group_id, knowledge_groups!inner(workspace_id)')
        .eq('knowledge_groups.workspace_id', workspaceId!)
      if (error) throw error
      return (data || []).map(({ article_id, group_id }) => ({ article_id, group_id }))
    },
    enabled: !!workspaceId && open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Редактировать папку' : 'Создать папку'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <NameInput
            value={name}
            onChange={onNameChange}
            placeholder="Введите название папки"
            label="Название папки"
            id="folder-name"
          />

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="w-auto">
              <TabsTrigger value="description">Описание</TabsTrigger>
              <TabsTrigger value="naming-prompt">AI промпт для названия</TabsTrigger>
              <TabsTrigger value="check-prompt">AI промпт для проверки</TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="mt-4">
              <div className="space-y-4">
                {workspaceId && onKnowledgeArticleChange && (
                  <div className="space-y-2">
                    <Label>Статья базы знаний</Label>
                    <ArticleTreePicker
                      articles={articles}
                      groups={groups}
                      articleGroups={articleGroups}
                      selectedId={knowledgeArticleId || null}
                      onSelect={onKnowledgeArticleChange}
                    />
                    {knowledgeArticleId && (
                      <p className="text-xs text-muted-foreground">
                        Привязанная статья будет отображаться как описание папки
                      </p>
                    )}
                  </div>
                )}
                {!knowledgeArticleId && (
                  <div className="space-y-2">
                    <Label htmlFor="folder-description">Текстовое описание (необязательно)</Label>
                    <Textarea
                      id="folder-description"
                      value={description}
                      onChange={(e) => onDescriptionChange(e.target.value)}
                      placeholder="Введите описание папки"
                      rows={10}
                      className="min-h-[300px]"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="naming-prompt" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="ai-naming-prompt">
                  AI промпт для названия документа (необязательно)
                </Label>
                <Textarea
                  id="ai-naming-prompt"
                  value={aiNamingPrompt}
                  onChange={(e) => onAiNamingPromptChange?.(e.target.value)}
                  placeholder="Проанализируй документ и предложи два названия на основе его содержания. КЛИЕНТ: Имя Фамилия клиента (или название компании клиента)"
                  rows={10}
                  className="min-h-[300px]"
                />
              </div>
            </TabsContent>

            <TabsContent value="check-prompt" className="mt-4">
              <div className="space-y-2">
                <Label htmlFor="ai-check-prompt">
                  AI промпт для проверки документа (необязательно)
                </Label>
                <Textarea
                  id="ai-check-prompt"
                  value={aiCheckPrompt}
                  onChange={(e) => onAiCheckPromptChange?.(e.target.value)}
                  placeholder="Проанализируй документ и выведи очень краткое резюме в одну строку: Название услуги, цена услуги, дата планируемого оказания услуги. Больше ничего не выводи. Сформулируй очень кратко, на русском языке"
                  rows={10}
                  className="min-h-[300px]"
                />
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={isSaving || !name.trim()}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : isEditing ? (
              'Сохранить'
            ) : (
              'Создать'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
