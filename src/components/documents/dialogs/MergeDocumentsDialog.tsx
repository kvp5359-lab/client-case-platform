"use client"

/**
 * Диалог объединения документов в PDF
 */

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles, GripVertical, X } from 'lucide-react'
import { NameInput } from '@/components/ui/name-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface MergeDocument {
  id: string
  name: string
}

interface MergeDocumentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  documents: MergeDocument[]
  mergedFileName: string
  targetFolderId: string | null
  folders: { id: string; name: string }[]
  onFileNameChange: (name: string) => void
  onTargetFolderChange: (folderId: string | null) => void
  onReorder: (fromIndex: number, toIndex: number) => void
  onRemove: (docId: string) => void
  onGenerateName: () => void
  onMerge: () => void
  isMerging: boolean
  isGeneratingName: boolean
}

export function MergeDocumentsDialog({
  open,
  onOpenChange,
  documents,
  mergedFileName,
  targetFolderId,
  folders,
  onFileNameChange,
  onTargetFolderChange,
  onReorder,
  onRemove,
  onGenerateName,
  onMerge,
  isMerging,
  isGeneratingName,
}: MergeDocumentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Объединить документы в PDF</DialogTitle>
          <DialogDescription>
            Перетащите документы для изменения порядка. Порядок сверху вниз = порядок страниц в
            итоговом PDF.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Список документов для объединения */}
          <div className="space-y-2">
            <Label>Документы для объединения ({documents.length})</Label>
            <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
              {documents.map((doc, idx) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 p-2 hover:bg-muted/50 cursor-grab"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', idx.toString())
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.add('bg-blue-50')
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove('bg-blue-50')
                  }}
                  onDragEnd={(e) => {
                    // Z3-06: сбросить подсветку при окончании drag (включая drop на себя)
                    e.currentTarget.classList.remove('bg-blue-50')
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.currentTarget.classList.remove('bg-blue-50')
                    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10)
                    if (!isNaN(fromIdx) && fromIdx !== idx) {
                      onReorder(fromIdx, idx)
                    }
                  }}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium w-6">{idx + 1}.</span>
                  <span className="text-sm truncate flex-1">{doc.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => onRemove(doc.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Название итогового файла */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="merged-name">Название итогового файла</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={onGenerateName}
                disabled={isGeneratingName}
              >
                {isGeneratingName ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Сгенерировать
                  </>
                )}
              </Button>
            </div>
            <NameInput
              id="merged-name"
              value={mergedFileName}
              onChange={onFileNameChange}
              placeholder="Введите название файла"
              label=""
            />
          </div>

          {/* Выбор папки назначения */}
          <div className="space-y-2">
            <Label>Сохранить в папку</Label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={targetFolderId === null ? 'default' : 'outline'}
                size="sm"
                onClick={() => onTargetFolderChange(null)}
              >
                Без группы
              </Button>
              {folders.map((folder) => (
                <Button
                  key={folder.id}
                  variant={targetFolderId === folder.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => onTargetFolderChange(folder.id)}
                >
                  {folder.name}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            onClick={onMerge}
            disabled={isMerging || documents.length < 2 || !mergedFileName.trim()}
          >
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Объединение...
              </>
            ) : (
              'Объединить'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
