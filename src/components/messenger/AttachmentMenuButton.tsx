import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MoreHorizontal, Eye, Download, FolderPlus, Forward, Trash2, Loader2 } from 'lucide-react'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  getAttachmentUrl,
  canInlinePreview,
  downloadAttachmentBlob,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messenger/messengerService'
import { useDeleteAttachment } from '@/hooks/messenger/useDeleteAttachment'
import { toast } from 'sonner'
import { AddToProjectDialog } from './AddToProjectDialog'

type AttachmentMenuButtonProps = {
  attachment: AttachmentType
  isOwn?: boolean
  projectId?: string
  workspaceId?: string
  /** Тред сообщения — нужен для удаления файла (инвалидация кэша ленты). */
  threadId?: string
  /** Custom handler for "Open" (e.g. lightbox for images) */
  onOpen?: () => void
  openLabel?: string
  loading: boolean
  setLoading: (v: boolean) => void
  /** Компактная (низкая) кнопка — чтобы не пересекаться с бейджем времени в
   *  правом нижнем углу плашки (последний файл). */
  compact?: boolean
}

export function AttachmentMenuButton({
  attachment,
  isOwn,
  projectId,
  workspaceId,
  threadId,
  onOpen,
  openLabel = 'Открыть документ',
  loading,
  setLoading,
  compact,
}: AttachmentMenuButtonProps) {
  const [addToProjectOpen, setAddToProjectOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const addToForwardBuffer = useSidePanelStore((s) => s.addToForwardBuffer)
  const deleteAttachmentMutation = useDeleteAttachment(threadId ?? '')
  // «Удалить файл» — только у своих сообщений и когда известен тред.
  const canDeleteAttachment = !!isOwn && !!threadId

  const handleForward = () => {
    addToForwardBuffer({
      id: crypto.randomUUID(),
      kind: 'file',
      sourceMessageId: attachment.message_id,
      fromAuthorName: '',
      content: '',
      attachments: [
        {
          file_id: attachment.file_id,
          file_name: attachment.file_name,
          file_size: attachment.file_size,
          mime_type: attachment.mime_type,
          storage_path: attachment.storage_path,
        },
      ],
    })
    toast.success('Файл добавлен к пересылке')
  }

  const handleOpen = async () => {
    if (onOpen) {
      onOpen()
      return
    }
    // То же, что в FileAttachment: для не-inline mime-типов сразу шлём
    // ?download=file_name, иначе Save dialog подставит сгенерированное
    // имя из storage_path вместо реального имени файла.
    const inline = canInlinePreview(attachment.mime_type)
    const newTab = window.open('', '_blank')
    if (!newTab) {
      toast.error('Браузер заблокировал открытие вкладки')
      return
    }
    setLoading(true)
    try {
      const url = await getAttachmentUrl(
        attachment.storage_path,
        attachment.file_id,
        inline ? null : attachment.file_name,
      )
      newTab.location.href = url
    } catch {
      newTab.close()
      toast.error('Не удалось открыть файл')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = async () => {
    setLoading(true)
    try {
      const blobUrl = await downloadAttachmentBlob(attachment.storage_path, attachment.file_id)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = attachment.file_name
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
    } catch {
      toast.error('Не удалось скачать файл')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="contents">
      {loading ? (
        <Loader2
          className={cn(
            'h-4 w-4 animate-spin shrink-0',
            isOwn ? 'text-white/60' : 'text-muted-foreground',
          )}
        />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('shrink-0', compact ? 'h-5 w-7' : 'h-7 w-7')}
              onClick={(e) => e.stopPropagation()}
              aria-label="Меню вложения"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            side="top"
            className="w-56"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem onClick={handleOpen}>
              <Eye className="h-4 w-4 mr-2" />
              {openLabel}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Скачать
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation()
                handleForward()
              }}
            >
              <Forward className="h-4 w-4 mr-2" />
              Переслать
            </DropdownMenuItem>
            {projectId && workspaceId && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setAddToProjectOpen(true)
                }}
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Добавить к документам проекта
              </DropdownMenuItem>
            )}
            {canDeleteAttachment && (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  setConfirmDeleteOpen(true)
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Удалить
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {canDeleteAttachment && (
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent onClick={(e) => e.stopPropagation()}>
            <AlertDialogHeader>
              <AlertDialogTitle>Удалить файл?</AlertDialogTitle>
              <AlertDialogDescription>
                Файл будет удалён из сервиса. Если возможно, он также удалится в
                подключённом канале (Telegram/WhatsApp) — иначе останется там, о
                чём вы получите уведомление.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Отмена</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  deleteAttachmentMutation.mutate({
                    attachmentId: attachment.id,
                    messageId: attachment.message_id,
                  })
                }
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {projectId && workspaceId && (
        <AddToProjectDialog
          open={addToProjectOpen}
          onOpenChange={setAddToProjectOpen}
          attachment={attachment}
          projectId={projectId}
          workspaceId={workspaceId}
        />
      )}
    </div>
  )
}
