import { useState } from 'react'
import { cn } from '@/lib/utils'
import { MoreHorizontal, Eye, Download, FolderPlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getAttachmentUrl,
  downloadAttachmentBlob,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messengerService'
import { toast } from 'sonner'
import { AddToProjectDialog } from './AddToProjectDialog'

interface AttachmentMenuButtonProps {
  attachment: AttachmentType
  isOwn?: boolean
  projectId?: string
  workspaceId?: string
  /** Custom handler for "Open" (e.g. lightbox for images) */
  onOpen?: () => void
  openLabel?: string
  loading: boolean
  setLoading: (v: boolean) => void
}

export function AttachmentMenuButton({
  attachment,
  isOwn,
  projectId,
  workspaceId,
  onOpen,
  openLabel = 'Открыть документ',
  loading,
  setLoading,
}: AttachmentMenuButtonProps) {
  const [addToProjectOpen, setAddToProjectOpen] = useState(false)

  const handleOpen = async () => {
    if (onOpen) {
      onOpen()
      return
    }
    const newTab = window.open('', '_blank')
    if (!newTab) {
      toast.error('Браузер заблокировал открытие вкладки')
      return
    }
    setLoading(true)
    try {
      const url = await getAttachmentUrl(attachment.storage_path, attachment.file_id)
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
              className="h-7 w-7 shrink-0"
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
          </DropdownMenuContent>
        </DropdownMenu>
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
