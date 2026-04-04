"use client"

/**
 * Компонент секции папки с документами
 *
 * Рефакторинг: использует DocumentKitContext вместо prop drilling
 * Принимает только данные папки, всё остальное берёт из Context
 */

import { memo, useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { sanitizeHtml } from '@/utils/sanitizeHtml'
import { safeCssColor } from '@/utils/isValidCssColor'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HelpCircle, BookOpen } from 'lucide-react'
import { FolderSectionHeader } from './FolderSectionHeader'
import { FolderSectionContent } from './FolderSectionContent'
import type { DocumentWithFiles, Folder as FolderType } from './types'
import {
  useDocumentKitData,
  useDocumentKitUIState,
  useDocumentKitHandlers,
  useDocumentKitIds,
} from '@/components/projects/DocumentKitsTab/context'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { getArticleById } from '@/services/api/knowledgeBaseService'

interface FolderSectionProps {
  folder: FolderType
  folderIndex?: number
  documents: DocumentWithFiles[]
}

export const FolderSection = memo(function FolderSection({
  folder,
  folderIndex,
  documents: folderDocuments,
}: FolderSectionProps) {
  const [isDescriptionDialogOpen, setIsDescriptionDialogOpen] = useState(false)

  const { folderStatuses, folderSlots } = useDocumentKitData()

  // Слоты этой папки
  const slots = useMemo(
    () => folderSlots.filter((s) => s.folder_id === folder.id),
    [folderSlots, folder.id],
  )
  const filledSlots = useMemo(
    () =>
      slots
        .filter((s) => s.document_id && s.document)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [slots],
  )
  const emptySlots = useMemo(() => slots.filter((s) => !s.document_id), [slots])

  // Map: documentId → slotId
  const slotByDocId = useMemo(() => {
    const map = new Map<string, string>()
    slots.forEach((s) => {
      if (s.document_id) map.set(s.document_id, s.id)
    })
    return map
  }, [slots])

  const { collapsedFolders, hoveredFolderId, draggedDocId, dragOverFolderId } =
    useDocumentKitUIState()
  const handlers = useDocumentKitHandlers()
  const { projectId, workspaceId } = useDocumentKitIds()

  const isCollapsed = collapsedFolders.has(folder.id)
  const isHovered = hoveredFolderId === folder.id
  const isDragOver = dragOverFolderId === folder.id
  const currentFolderStatus = folderStatuses.find((s) => s.id === folder.status) || null

  // Загрузка привязанной статьи базы знаний
  const { data: linkedArticle } = useQuery({
    queryKey: knowledgeBaseKeys.article(folder.knowledge_article_id!),
    queryFn: () => getArticleById(folder.knowledge_article_id!),
    enabled: !!folder.knowledge_article_id,
  })

  const hasDescription = !!folder.knowledge_article_id || !!folder.description

  // Кнопка описания папки (переиспользуется в двух местах)
  const descriptionButton = hasDescription ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-4 w-4 p-0 flex-shrink-0 group hover:bg-transparent"
      onClick={(e) => {
        e.stopPropagation()
        setIsDescriptionDialogOpen(true)
      }}
      title="Показать описание"
    >
      {folder.knowledge_article_id ? (
        <BookOpen className="h-4 w-4 text-blue-500 group-hover:text-blue-600 transition-colors" />
      ) : (
        <HelpCircle className="h-4 w-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
      )}
    </Button>
  ) : null

  return (
    <Collapsible
      open={!isCollapsed}
      onOpenChange={() => handlers.onToggleFolder(folder.id)}
      className="overflow-visible rounded-xl"
      style={{
        backgroundColor: currentFolderStatus?.color
          ? `${safeCssColor(currentFolderStatus.color)}15`
          : '#f3f4f6',
      }}
    >
      <FolderSectionHeader
        folder={folder}
        folderIndex={folderIndex}
        documentsCount={folderDocuments.length}
        slotsCount={slots.length}
        filledSlotsCount={filledSlots.length}
        emptySlotsCount={emptySlots.length}
        folderStatuses={folderStatuses}
        currentFolderStatus={currentFolderStatus}
        isCollapsed={isCollapsed}
        isHovered={isHovered}
        isDragOver={isDragOver}
        linkedArticleTitle={linkedArticle?.title}
        projectId={projectId}
        workspaceId={workspaceId}
        descriptionButton={descriptionButton}
        handlers={handlers}
      />

      <CollapsibleContent>
        <FolderSectionContent
          folderDocuments={folderDocuments}
          filledSlots={filledSlots}
          allSlots={slots}
          slotByDocId={slotByDocId}
          isDragOver={isDragOver}
          draggedDocId={draggedDocId}
          folderId={folder.id}
          handlers={handlers}
        />
      </CollapsibleContent>

      {/* Диалог с описанием папки */}
      <Dialog open={isDescriptionDialogOpen} onOpenChange={setIsDescriptionDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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
    </Collapsible>
  )
})
