/**
 * Секция метаданных статьи: группы, теги, AI summary, статус, индексация, автосохранение.
 * Используется в KnowledgeBaseArticleEditorPage.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { StatusDropdown } from '@/components/ui/status-dropdown'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Tag, Plus, Sparkles, ChevronDown, Loader2 } from 'lucide-react'
import { getTagColors, NotionPill } from '@/utils/notionPill'
import { IndexingBadge } from './IndexingBadge'
import { ArticleTreePicker } from '@/components/templates/ArticleTreePicker'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { generateArticleSummary } from '@/services/api/knowledgeSearchService'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { toast } from 'sonner'
import type { useArticleEditor } from '../useArticleEditor'

type Editor = ReturnType<typeof useArticleEditor>

interface ArticleMetadataSectionProps {
  editor: Editor
}

export function ArticleMetadataSection({ editor }: ArticleMetadataSectionProps) {
  const queryClient = useQueryClient()
  const [showSummary, setShowSummary] = useState(false)

  const summaryMutation = useMutation({
    mutationFn: () => generateArticleSummary(editor.articleId!, editor.workspaceId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.article(editor.articleId!) })
      toast.success('Summary сгенерировано')
    },
    onError: () => {
      toast.error('Не удалось сгенерировать summary')
    },
  })

  return (
    <div className="flex items-center gap-3">
      {/* Left group: groups + tags */}
      <div className="flex items-center gap-3 border border-border rounded-md px-3 h-9">
        <span className="text-sm text-muted-foreground shrink-0">Группы:</span>
        <ArticleTreePicker
          mode="multiple-groups"
          groups={editor.groups}
          selectedGroupIds={editor.selectedGroupIds}
          onToggleGroup={editor.handleToggleGroup}
          emptyLabel="Не выбрано"
          searchPlaceholder="Поиск группы..."
        />

        <Separator orientation="vertical" className="h-5" />

        <Tag className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Popover>
          <PopoverTrigger asChild>
            <div className="flex items-center gap-1 min-h-[24px] cursor-pointer rounded px-1.5 py-0.5 hover:bg-gray-50 transition-colors">
              {editor.allTags
                .filter((t) => editor.selectedTagIds.includes(t.id))
                .map((t) => {
                  const c = getTagColors(t.color)
                  return <NotionPill key={t.id} name={t.name} bg={c.bg} text={c.text} />
                })}
              {editor.selectedTagIds.length === 0 && (
                <span className="text-xs text-muted-foreground">Не выбрано</span>
              )}
            </div>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="space-y-0.5 max-h-60 overflow-auto">
              {editor.allTags.map((tag) => {
                const c = getTagColors(tag.color)
                return (
                  <label
                    key={tag.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <Checkbox
                      checked={editor.selectedTagIds.includes(tag.id)}
                      onCheckedChange={() => editor.handleToggleTag(tag.id)}
                    />
                    <NotionPill name={tag.name} bg={c.bg} text={c.text} />
                  </label>
                )
              })}
              {editor.allTags.length === 0 && (
                <p className="text-xs text-muted-foreground px-2 py-3 text-center">Нет тегов</p>
              )}
            </div>
            <div className="border-t mt-1.5 pt-1.5">
              <div className="flex items-center gap-1.5 px-1">
                <Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <input
                  value={editor.newTagName}
                  onChange={(e) => editor.setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') editor.handleCreateTag()
                    if (e.key === 'Escape') editor.setNewTagName('')
                  }}
                  placeholder="Новый тег..."
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                />
                {editor.newTagName.trim() && (
                  <button
                    onClick={editor.handleCreateTag}
                    disabled={editor.createTagMutation.isPending}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    {editor.createTagMutation.isPending ? '...' : 'Добавить'}
                  </button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* AI Summary popover */}
      <Popover open={showSummary} onOpenChange={setShowSummary}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
            AI Summary
            <ChevronDown className="w-3 h-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[500px] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">AI Summary</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => summaryMutation.mutate()}
              disabled={summaryMutation.isPending}
            >
              {summaryMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Генерация...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                  Сгенерировать
                </>
              )}
            </Button>
          </div>
          {editor.articleQuery.data?.summary ? (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {editor.articleQuery.data.summary}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">Summary ещё не сгенерировано</p>
          )}
        </PopoverContent>
      </Popover>

      {/* Right group: status + indexing + autosave */}
      <div className="flex items-center gap-3 border border-border rounded-md px-3 h-9 ml-auto shrink-0">
        <div className="flex items-center gap-2">
          <StatusDropdown
            currentStatus={
              (editor.statusesQuery.data || []).find((s) => s.id === editor.statusId) || null
            }
            statuses={editor.statusesQuery.data || []}
            onStatusChange={(newStatusId) => {
              editor.setStatusId(newStatusId)
              editor.updateStatusMutation.mutate(newStatusId)
            }}
            size="md"
          />
          <span className="text-sm text-muted-foreground">
            {(editor.statusesQuery.data || []).find((s) => s.id === editor.statusId)?.name ||
              'Нет статуса'}
          </span>
        </div>

        <Separator orientation="vertical" className="h-5" />

        {/* Indexing status + reindex button */}
        <IndexingBadge
          status={editor.articleQuery.data?.indexing_status}
          isIndexing={editor.isIndexing}
          onReindex={() => {
            if (editor.articleId && editor.workspaceId) {
              editor.indexNow(editor.articleId, editor.workspaceId)
            }
          }}
        />

        <Separator orientation="vertical" className="h-5" />

        <div className="text-sm shrink-0">
          {editor.updateContentMutation.isPending ? (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Сохранение...
            </span>
          ) : editor.isContentDirty ? (
            <span className="text-amber-600">Изменено</span>
          ) : editor.articleQuery.data ? (
            <span className="text-green-600">Сохранено</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}
