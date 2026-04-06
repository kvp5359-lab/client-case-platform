"use client"

/**
 * GenerationItem — компактная строка блока генерации в списке.
 * При клике открывает модалку с полями и кнопками.
 *
 * После генерации PDF открывается диалог выбора папки для сохранения
 * документа прямо в проект (без скачивания на компьютер).
 */

import { FileText } from 'lucide-react'
import { useGenerationCardHandlers } from './hooks/useGenerationCardHandlers'
import { GenerationEditDialog } from './GenerationEditDialog'
import { GenerationSaveDialog } from './GenerationSaveDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { DocumentGeneration } from '@/services/api/documents/documentGenerationService'

interface FolderInfo {
  id: string
  name: string
  document_kit_id: string
}

interface GenerationCardProps {
  generation: DocumentGeneration
  workspaceId: string
  projectId: string
  folders?: FolderInfo[]
}

export function GenerationCard({
  generation,
  workspaceId,
  projectId,
  folders = [],
}: GenerationCardProps) {
  const h = useGenerationCardHandlers(generation, workspaceId, projectId)

  return (
    <>
      {/* Компактная строка в списке */}
      <button
        type="button"
        onClick={h.handleDialogOpen}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white hover:bg-muted/30 transition-colors text-left group"
      >
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate">{generation.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {h.filledCount}/{h.placeholders.length}
        </span>
        {h.template && (
          <span className="text-xs text-muted-foreground/60 truncate ml-auto">
            {h.template.name}
          </span>
        )}
      </button>

      <GenerationEditDialog
        open={h.dialogOpen}
        onOpenChange={h.handleClose}
        nameValue={h.nameValue}
        onNameChange={h.setNameValue}
        templateName={h.template?.name}
        placeholders={h.placeholders}
        localValues={h.localValues}
        onFieldChange={h.handleFieldChange}
        onFillFromFormKit={h.handleFillFromFormKit}
        isFilling={h.fillMutation.isPending}
        onGenerate={h.handleGenerate}
        isGenerating={h.generateMutation.isPending}
        onDelete={h.handleDelete}
      />

      <GenerationSaveDialog
        open={h.saveDialogOpen}
        onOpenChange={h.handleSaveDialogClose}
        fileName={h.generatedResult?.fileName}
        folders={folders}
        isSaving={h.isSaving}
        savingFolderId={h.savingFolderId}
        onSaveToFolder={h.handleSaveToFolder}
        onDownload={h.handleDownload}
      />

      <ConfirmDialog
        state={h.deleteConfirmState}
        onConfirm={h.handleDeleteConfirm}
        onCancel={h.handleDeleteCancel}
      />
    </>
  )
}
