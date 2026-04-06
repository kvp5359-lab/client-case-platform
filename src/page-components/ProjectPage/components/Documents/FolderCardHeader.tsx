"use client"

/**
 * Заголовок карточки папки: название, бейджи, действия, описание, прогресс загрузки
 */

import { useState } from 'react'
import { HelpCircle, Loader2, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { CommentBadge } from '@/components/comments'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { getArticleById } from '@/services/api/knowledge/knowledgeBaseService'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'
import type { Folder } from '@/components/documents/types'

export interface FolderCardHeaderProps {
  folder: Folder
  projectId: string | undefined
  workspaceId: string | undefined
  isUploading: boolean
  sourceUploadTargetDocId: string | null
  sourceUploadPhase: 'downloading' | 'uploading' | null
  onEditFolder?: (folderId: string) => void
  onDeleteFolder?: (folderId: string) => void
  onAddSlot?: (folderId: string) => void
  onAddDocument?: (folderId: string) => void
}

export function FolderCardHeader({
  folder,
  projectId,
  workspaceId,
  isUploading,
  sourceUploadTargetDocId,
  sourceUploadPhase,
  onEditFolder,
  onDeleteFolder,
  onAddSlot,
  onAddDocument,
}: FolderCardHeaderProps) {
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false)

  const { data: linkedArticle } = useQuery({
    queryKey: knowledgeBaseKeys.article(folder.knowledge_article_id!),
    queryFn: () => getArticleById(folder.knowledge_article_id!),
    enabled: !!folder.knowledge_article_id,
  })

  const hasDescription = !!folder.knowledge_article_id || !!folder.description

  return (
    <>
      {/* Разделитель */}
      <div className="mt-5 ml-1 mr-3 border-t border-gray-100" />
      {/* Заголовок папки */}
      <div className="group/header -mt-0.5 py-1 pl-1 pr-3 select-none">
        <div className="flex items-center gap-2 w-full">
          <div className="text-sm font-medium tracking-tight text-brand-500 flex items-center gap-2 min-w-0">
            <span className="truncate">{folder.name}</span>
            {hasDescription && (
              <button
                className="p-0 flex-shrink-0 hover:bg-transparent"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsDescriptionDialogOpen(true)
                }}
                title="Показать описание"
              >
                <HelpCircle className="h-4 w-4 text-muted-foreground/50 hover:text-muted-foreground transition-colors" />
              </button>
            )}
            {projectId && workspaceId && (
              <div onClick={(e) => e.stopPropagation()}>
                <CommentBadge
                  entityType="document_folder"
                  entityId={folder.id}
                  projectId={projectId}
                  workspaceId={workspaceId}
                  emptyClassName="opacity-0 group-hover/card:opacity-100"
                />
              </div>
            )}
            {(onEditFolder || onDeleteFolder) && (
              <div
                className="opacity-0 group-hover/card:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                    >
                      <MoreHorizontal className="h-4 w-4 text-muted-foreground/60" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {onEditFolder && (
                      <DropdownMenuItem onClick={() => onEditFolder(folder.id)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Редактировать папку
                      </DropdownMenuItem>
                    )}
                    {onDeleteFolder && (
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => onDeleteFolder(folder.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Удалить папку
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
          {/* Кнопки добавления — прижаты к правому краю */}
          {(onAddSlot || onAddDocument) && (
            <div className="flex items-center gap-1.5 ml-auto opacity-0 group-hover/card:opacity-100 transition-opacity flex-shrink-0">
              {onAddSlot && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 h-5 px-2 text-[12px] text-gray-500 border border-dashed border-gray-400 rounded-md hover:text-gray-700 hover:border-gray-500 hover:bg-gray-100 transition-colors"
                  onClick={() => onAddSlot(folder.id)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Слот
                </button>
              )}
              {onAddDocument && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 h-5 px-2 text-[12px] text-blue-600 border border-dashed border-blue-400 rounded-md hover:text-blue-700 hover:border-blue-500 hover:bg-blue-50 transition-colors"
                  onClick={() => onAddDocument(folder.id)}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Документы
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Прогресс загрузки из источника — показывается вверху только если drop был на папку без конкретного документа */}
      {isUploading && !sourceUploadTargetDocId && (
        <div className="mx-2 mt-1 mb-0 overflow-hidden rounded-md border border-purple-200 bg-purple-50">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-purple-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span className="truncate">
              {sourceUploadPhase === 'downloading'
                ? 'Скачивание с Google Drive...'
                : sourceUploadPhase === 'uploading'
                  ? 'Загрузка в хранилище...'
                  : 'Подготовка...'}
            </span>
          </div>
          <div className="h-1 bg-purple-100">
            <div
              className={cn(
                'h-full bg-purple-500 transition-all duration-500',
                sourceUploadPhase === 'downloading' && 'w-2/5 animate-pulse',
                sourceUploadPhase === 'uploading' && 'w-4/5 animate-pulse',
                !sourceUploadPhase && 'w-1/6 animate-pulse',
              )}
            />
          </div>
        </div>
      )}

      {/* Диалог с описанием папки */}
      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Описание папки: {folder.name}</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {linkedArticle?.content ? (
              <div
                className={cn(
                  'prose max-w-none',
                  'prose-p:my-0 prose-li:my-0 prose-ul:my-0 prose-ol:my-0',
                  'prose-h1:my-0 prose-h2:my-0 prose-h3:my-0',
                  'prose-blockquote:my-0 prose-pre:my-0 prose-table:my-0',
                  'prose-hr:my-0 prose-img:my-0',
                  '[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-4 [&_h1]:mt-6',
                  '[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-3 [&_h2]:mt-5',
                  '[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-4',
                  '[&_p]:mb-2 [&_p]:leading-relaxed [&_p:empty]:min-h-[1em]',
                  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-2',
                  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-2',
                  '[&_li]:mb-0 [&_li_p]:mb-0 [&_li_p:empty]:min-h-[1em] [&_li_p:has(>br:only-child)]:min-h-[1em]',
                  '[&_a]:text-primary [&_a]:underline',
                  '[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:my-4',
                  '[&_code]:bg-[#eeeef1] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono',
                  '[&_pre]:bg-muted [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:my-4 [&_pre]:overflow-x-auto',
                  '[&_table]:w-full [&_table]:border-collapse [&_table]:my-4',
                  '[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:bg-muted [&_th]:font-semibold [&_th]:text-left',
                  '[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2',
                  '[&_th_p]:mb-0 [&_td_p]:mb-0',
                  '[&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3',
                  '[&_hr]:my-6 [&_hr]:border-border',
                )}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(linkedArticle.content) }}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">
                {folder.description || 'Описание отсутствует'}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
