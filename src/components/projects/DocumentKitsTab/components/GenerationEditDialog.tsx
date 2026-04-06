"use client"

/**
 * Диалог редактирования блока генерации — поля плейсхолдеров, генерация PDF
 */

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trash2, FileDown, ClipboardPaste, Loader2 } from 'lucide-react'
import type { DocumentTemplatePlaceholder } from '@/services/api/documents/documentTemplateService'

interface GenerationEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nameValue: string
  onNameChange: (value: string) => void
  templateName?: string
  placeholders: DocumentTemplatePlaceholder[]
  localValues: Record<string, string>
  onFieldChange: (name: string, value: string) => void
  onFillFromFormKit: () => void
  isFilling: boolean
  onGenerate: () => void
  isGenerating: boolean
  onDelete: () => void
}

export function GenerationEditDialog({
  open,
  onOpenChange,
  nameValue,
  onNameChange,
  templateName,
  placeholders,
  localValues,
  onFieldChange,
  onFillFromFormKit,
  isFilling,
  onGenerate,
  isGenerating,
  onDelete,
}: GenerationEditDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            <Input
              value={nameValue}
              onChange={(e) => onNameChange(e.target.value)}
              className="text-xl md:text-xl font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0"
              placeholder="Название..."
            />
          </DialogTitle>
          <DialogDescription>
            {templateName
              ? `Шаблон: ${templateName}`
              : 'Шаблон не найден. Возможно, он был удалён.'}
          </DialogDescription>
        </DialogHeader>

        {/* Кнопка заполнения из анкеты — над полями */}
        {placeholders.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onFillFromFormKit}
            disabled={isFilling}
            className="w-fit"
          >
            {isFilling ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <ClipboardPaste className="h-4 w-4 mr-1.5" />
            )}
            Заполнить из анкеты
          </Button>
        )}

        {/* Поля плейсхолдеров */}
        {placeholders.length > 0 ? (
          <div className="space-y-1.5 py-1">
            {placeholders.map((ph) => (
              <div key={ph.name} className="flex items-center gap-3">
                <label className="text-xs text-muted-foreground w-1/3 shrink-0 truncate">
                  {ph.label || ph.name}
                </label>
                <Input
                  value={localValues[ph.name] || ''}
                  onChange={(e) => onFieldChange(ph.name, e.target.value)}
                  placeholder={`{{${ph.name}}}`}
                  className={cn(
                    'h-8 text-xs placeholder:text-muted-foreground/40',
                    localValues[ph.name]?.trim() && 'border-green-400',
                  )}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4 text-center">
            {templateName ? 'В шаблоне нет плейсхолдеров.' : 'Шаблон не найден.'}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Удалить
          </Button>

          <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                Генерация...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 mr-1.5" />
                Сгенерировать PDF
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
