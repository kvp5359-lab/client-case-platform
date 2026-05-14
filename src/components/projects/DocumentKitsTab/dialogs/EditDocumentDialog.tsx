"use client"

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Loader2, Eye, ExternalLink, Bot } from 'lucide-react'
import { NameInput } from '@/components/ui/name-input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
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

  // Режим «работа рядом с ассистентом»: включается ЯВНО кликом по Bot.
  // В этом режиме диалог становится не-модальным (без затемнения и блокировки
  // фокуса) и сдвигается влево, в центр свободной области, чтобы не перекрывать
  // панель ассистента. Сбрасывается при закрытии диалога.
  const [assistantMode, setAssistantMode] = useState(false)
  useEffect(() => {
    if (!open) setAssistantMode(false)
  }, [open])

  const [leftPx, setLeftPx] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!open || !assistantMode) {
      setLeftPx(null)
      return
    }
    const compute = () => {
      const sidebarEl = document.querySelector('[data-workspace-sidebar]') as HTMLElement | null
      const sidebarWidth = sidebarEl
        ? sidebarEl.getBoundingClientRect().width
        : (parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10) || 280)
      const sidePanel = document.querySelector('.side-panel') as HTMLElement | null
      const rect = sidePanel?.getBoundingClientRect()
      const rightWidth = rect && rect.width > 0 ? rect.width : 0
      const center = sidebarWidth + (window.innerWidth - sidebarWidth - rightWidth) / 2
      setLeftPx(center)
    }
    compute()
    const ro = new ResizeObserver(compute)
    const sp = document.querySelector('.side-panel') as HTMLElement | null
    if (sp) ro.observe(sp)
    const sbEl = document.querySelector('[data-workspace-sidebar]') as HTMLElement | null
    if (sbEl) ro.observe(sbEl)
    ro.observe(document.body)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [open, assistantMode])

  // В режиме assistantMode — рендерим через Radix-примитивы напрямую (без
  // shadcn DialogContent, который тащит за собой DialogOverlay).
  // modal={false} — снимает focus-trap и блокировку прокрутки body.
  if (assistantMode) {
    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={false}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Content
            onInteractOutside={(e) => e.preventDefault()}
            className={cn(
              'fixed top-16 z-50 grid w-[calc(100%-2rem)] max-w-2xl gap-4 border bg-background p-6 shadow-lg duration-200 rounded-lg max-h-[calc(100vh-theme(spacing.16)-theme(spacing.8))] overflow-y-auto',
              'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            )}
            style={{
              left: leftPx != null ? `${leftPx}px` : '50%',
              transform: 'translateX(-50%)',
              visibility: leftPx != null ? 'visible' : 'hidden',
            }}
          >
            <DialogPrimitive.Title className="text-lg font-semibold leading-none tracking-tight">
              Параметры документа
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Редактирование параметров документа
            </DialogPrimitive.Description>
            {renderBody()}
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    )
  }

  function renderBody() {
    return (
      <>
        <div className="flex flex-wrap items-center gap-2 pb-1">
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
                onClick={() => {
                  onOpenAIChat()
                  setAssistantMode(true)
                }}
                disabled={!documentToEdit || !isContentAvailable}
                title="Открыть ассистента с этим документом"
                className="rounded-none border-0 border-l border-white bg-yellow-400 text-black hover:bg-yellow-500 px-2 h-full"
              >
                <Bot className="h-4 w-4" />
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
          <div className="space-y-2">
            <NameInput
              id="doc-name"
              value={name}
              onChange={onNameChange}
              placeholder="Название документа"
              label=""
            />
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

        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={!name.trim()}>
            Сохранить
          </Button>
        </div>
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Параметры документа</DialogTitle>
          <DialogDescription className="sr-only">
            Редактирование параметров документа
          </DialogDescription>
        </DialogHeader>
        {renderBody()}
      </DialogContent>
    </Dialog>
  )
}
