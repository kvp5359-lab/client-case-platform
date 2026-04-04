"use client"

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, GripVertical, X, Sparkles } from 'lucide-react'
import { NameInput } from '@/components/ui/name-input'
import { formatSize } from '@/utils/formatSize'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MergeDocItem {
  id: string
  name: string
  size: number
  order: number
}

interface Folder {
  id: string
  name: string
}

interface MergeDocumentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Данные
  mergeDocsList: MergeDocItem[]
  mergeName: string
  mergeFolderId: string | null
  folders: Folder[]
  // Состояния
  isMerging: boolean
  isGeneratingName: boolean
  draggedIndex: number | null
  // Обработчики
  onNameChange: (name: string) => void
  onFolderChange: (folderId: string | null) => void
  onRemoveDoc: (docId: string) => void
  onDragStart: (index: number) => void
  onDragOver: (e: React.DragEvent, index: number) => void
  onDragEnd: () => void
  onGenerateName: () => void
  onMerge: () => void
}

export function MergeDocumentsDialog({
  open,
  onOpenChange,
  mergeDocsList,
  mergeName,
  mergeFolderId,
  folders,
  isMerging,
  isGeneratingName,
  draggedIndex,
  onNameChange,
  onFolderChange,
  onRemoveDoc,
  onDragStart,
  onDragOver,
  onDragEnd,
  onGenerateName,
  onMerge,
}: MergeDocumentsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Объединить документы в PDF</DialogTitle>
          <DialogDescription>
            Перетащите документы для изменения порядка. Все документы будут объединены в один PDF
            файл.
          </DialogDescription>
        </DialogHeader>

        {/* Поле названия с кнопкой AI */}
        <div className="relative">
          <NameInput
            value={mergeName}
            onChange={onNameChange}
            placeholder={
              isGeneratingName
                ? 'AI генерирует название...'
                : 'Введите название для объединённого документа'
            }
            label=""
            id="merge-name"
            disabled={isGeneratingName}
            className="[&_input]:pr-10"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-[calc(50%+0.5rem)] -translate-y-1/2 h-7 w-7"
            title="Сгенерировать название с помощью AI"
            disabled={isGeneratingName}
            onClick={onGenerateName}
          >
            {isGeneratingName ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Sparkles className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>

        {/* Список документов */}
        <div className="space-y-2">
          <div className="text-sm font-medium">Документы ({mergeDocsList.length})</div>

          {/* Список документов с drag-and-drop */}
          <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
            {mergeDocsList.map((doc, index) => (
              <div
                key={doc.id}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
                className={`flex items-center gap-2 p-2 border rounded-lg bg-background hover:bg-muted/50 cursor-grab active:cursor-grabbing transition-colors ${
                  draggedIndex === index ? 'opacity-50 border-primary' : ''
                }`}
              >
                {/* Иконка перетаскивания */}
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />

                {/* Информация о документе */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2 text-sm">
                    <span className="truncate">{doc.name}</span>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatSize(doc.size)}
                    </span>
                  </div>
                </div>

                {/* Номер порядка */}
                <Badge variant="secondary" className="flex-shrink-0 text-xs h-5 px-1.5">
                  {doc.order}
                </Badge>

                {/* Кнопка удаления */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 flex-shrink-0"
                  onClick={() => onRemoveDoc(doc.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Разделитель */}
        <Separator />

        {/* Выбор секции */}
        <div className="space-y-2">
          <Label className="text-sm">Сохранить в секцию</Label>
          <Select
            value={mergeFolderId || 'ungrouped'}
            onValueChange={(value) => onFolderChange(value === 'ungrouped' ? null : value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите секцию" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ungrouped">Без группы</SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.id} value={folder.id}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Кнопки действий */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onMerge} disabled={mergeDocsList.length < 2 || isMerging}>
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Объединение...
              </>
            ) : (
              'Объединить в PDF'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
