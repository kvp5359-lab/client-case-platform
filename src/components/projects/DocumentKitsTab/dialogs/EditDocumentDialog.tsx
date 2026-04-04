"use client"

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, ExternalLink, Sparkles } from 'lucide-react'
import { NameInput } from '@/components/ui/name-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'

interface Status {
  id: string
  name: string
  color?: string | null
  is_final?: boolean
}

interface EditDocumentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // Данные формы
  name: string
  description: string
  status: string | null
  suggestedNames: string[]
  // Состояния
  isCheckingDocument: boolean
  documentToEdit: { id: string; name: string; text_content?: string | null } | null
  // Данные
  statuses: Status[]
  // Обработчики
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onStatusChange: (status: string) => void
  onSave: () => void
  onVerify: () => void
  onViewContent: () => void
  onOpenDocument?: () => void
  onOpenAIChat?: () => void
}

export function EditDocumentDialog({
  open,
  onOpenChange,
  name,
  description,
  status,
  suggestedNames,
  isCheckingDocument,
  documentToEdit,
  statuses,
  onNameChange,
  onDescriptionChange,
  onStatusChange,
  onSave,
  onVerify,
  onViewContent,
  onOpenDocument,
  onOpenAIChat,
}: EditDocumentDialogProps) {
  // Polling: отслеживает появление text_content, пока диалог открыт
  const [polledContent, setPolledContent] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevDocId = useRef<string | null>(null)

  // Сброс при смене документа
  if (documentToEdit?.id !== prevDocId.current) {
    prevDocId.current = documentToEdit?.id ?? null
    if (polledContent) setPolledContent(false)
  }

  const isContentAvailable = !!documentToEdit?.text_content || polledContent

  // Polling: если диалог открыт и text_content пуст — проверяем БД каждые 2 сек
  useEffect(() => {
    if (!open || !documentToEdit?.id || isContentAvailable) return

    pollingRef.current = setInterval(async () => {
      const { data } = await supabase
        .from('documents')
        .select('text_content')
        .eq('id', documentToEdit.id)
        .single()

      if (data?.text_content) {
        setPolledContent(true)
        if (pollingRef.current) clearInterval(pollingRef.current)
      }
    }, 2000)

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [open, documentToEdit?.id, isContentAvailable])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Параметры документа</DialogTitle>
          <DialogDescription className="sr-only">
            Редактирование параметров документа
          </DialogDescription>
        </DialogHeader>

        {/* Кнопки действий в верхней части */}
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {/* Группа: Проверить + Ассистент */}
          <div className="flex rounded-md overflow-hidden border border-yellow-400 h-8">
            <Button
              onClick={onVerify}
              disabled={isCheckingDocument}
              size="sm"
              className="bg-yellow-400 text-black hover:bg-yellow-500 rounded-none border-0 h-full"
            >
              {isCheckingDocument && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Проверить документ
            </Button>
            {onOpenAIChat && (
              <Button
                size="sm"
                onClick={onOpenAIChat}
                disabled={!documentToEdit || !isContentAvailable}
                title="Отправить в ассистент"
                className="rounded-none border-0 border-l border-yellow-500/30 bg-yellow-400 text-black hover:bg-yellow-500 px-2 h-full"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onViewContent}
            disabled={!documentToEdit || !isContentAvailable}
          >
            <Eye className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Просмотреть содержимое</span>
            <span className="sm:hidden">Содержимое</span>
          </Button>
          {onOpenDocument && (
            <Button variant="outline" size="sm" onClick={onOpenDocument} disabled={!documentToEdit}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Открыть
            </Button>
          )}
        </div>

        <div className="space-y-4 py-4">
          {/* Название */}
          <div className="space-y-2">
            <NameInput
              id="doc-name"
              value={name}
              onChange={onNameChange}
              placeholder="Название документа"
              label=""
            />

            {/* Предложенные названия */}
            {suggestedNames.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {suggestedNames.map((suggestedName, index) => (
                  <Badge
                    key={index}
                    variant="secondary"
                    className="cursor-pointer hover:bg-amber-400 hover:text-black transition-colors bg-amber-100 text-black"
                    onClick={() => onNameChange(suggestedName)}
                  >
                    {suggestedName}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Описание */}
          <div className="space-y-2">
            <Label htmlFor="doc-description">Описание</Label>
            <Textarea
              id="doc-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Описание или комментарий к документу"
              className="min-h-[60px] sm:min-h-[100px]"
              rows={3}
            />
          </div>

          {/* Статус */}
          <div className="space-y-2">
            <Label>Статус</Label>
            <div className="flex flex-col gap-2.5">
              {[false, true].map((isFinalGroup) => {
                const group = statuses.filter((s) => !!s.is_final === isFinalGroup)
                if (group.length === 0) return null
                return (
                  <div key={String(isFinalGroup)} className="flex flex-wrap gap-1.5">
                    {!isFinalGroup && (
                      <button
                        type="button"
                        onClick={() => onStatusChange('')}
                        className={`inline-flex items-center px-2.5 py-1 rounded text-[14px] leading-tight transition-all ${
                          !status || !statuses.some((s) => s.id === status)
                            ? 'bg-gray-200 text-gray-700 ring-1 ring-gray-400'
                            : 'border border-gray-200 text-gray-400 hover:text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        Нет статуса
                      </button>
                    )}
                    {group.map((s) => {
                      const isActive = status === s.id
                      const color = s.color ?? '#9ca3af'
                      let hex = color.replace('#', '')
                      if (hex.length === 3) {
                        hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
                      }
                      const r = parseInt(hex.substring(0, 2), 16) || 0
                      const g = parseInt(hex.substring(2, 4), 16) || 0
                      const b = parseInt(hex.substring(4, 6), 16) || 0
                      const paleColor = `rgb(${Math.round(r * 0.4 + 255 * 0.6)}, ${Math.round(g * 0.4 + 255 * 0.6)}, ${Math.round(b * 0.4 + 255 * 0.6)})`
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => onStatusChange(s.id)}
                          className="inline-flex items-center px-2.5 py-1 rounded text-[14px] leading-tight transition-all hover:opacity-80"
                          style={
                            isActive
                              ? { backgroundColor: color, color: '#fff' }
                              : { border: `1px solid ${paleColor}`, color: paleColor }
                          }
                        >
                          {s.name}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={!name.trim()}>
            Сохранить
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
