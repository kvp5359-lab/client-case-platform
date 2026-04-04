"use client"

/**
 * Диалог редактирования документа
 */

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { DialogBaseProps } from '@/types'

interface EditDocumentDialogProps extends DialogBaseProps {
  name: string
  description: string
  textContent: string | null
  aiCheckResult: string | null
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onSave: () => void
  onViewContent: () => void
  onAiCheck: () => void
  isSaving: boolean
  isCheckingAI: boolean
}

export function EditDocumentDialog({
  open,
  onOpenChange,
  name,
  description,
  textContent,
  aiCheckResult,
  onNameChange,
  onDescriptionChange,
  onSave,
  onViewContent,
  onAiCheck,
  isSaving,
  isCheckingAI,
}: EditDocumentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Редактировать документ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="doc-name">Название</Label>
            <Input
              id="doc-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Введите название документа"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doc-description">Описание</Label>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Введите описание документа"
              rows={3}
            />
          </div>
          
          {/* Секция текстового содержимого */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Текстовое содержимое</Label>
              {textContent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onViewContent}
                >
                  Просмотреть ({textContent.length} символов)
                </Button>
              )}
            </div>
            {!textContent && (
              <p className="text-sm text-muted-foreground">
                Текстовое содержимое не извлечено
              </p>
            )}
          </div>
          
          {/* Секция AI проверки */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label>AI проверка</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={onAiCheck}
                disabled={isCheckingAI || !textContent}
              >
                {isCheckingAI ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Проверка...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Проверить документ
                  </>
                )}
              </Button>
            </div>
            {aiCheckResult ? (
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">Результат AI</Badge>
                </div>
                <p className="text-sm whitespace-pre-wrap">{aiCheckResult}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {textContent 
                  ? 'Нажмите "Проверить документ" для AI-анализа'
                  : 'Для AI проверки требуется текстовое содержимое'}
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Сохранение...
              </>
            ) : (
              'Сохранить'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}







