import { useState } from 'react'
import { cn } from '@/lib/utils'
import { FileText, Loader2 } from 'lucide-react'
import {
  getAttachmentUrl,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messenger/messengerService'
import { formatSize } from '@/utils/files/formatSize'
import { toast } from 'sonner'
import { AttachmentMenuButton } from './AttachmentMenuButton'

interface FileAttachmentProps {
  attachment: AttachmentType
  isOwn?: boolean
  isDraft?: boolean
  isFailed?: boolean
  projectId?: string
  workspaceId?: string
}

export function FileAttachment({
  attachment,
  isOwn,
  isDraft,
  isFailed,
  projectId,
  workspaceId,
}: FileAttachmentProps) {
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    if (!attachment.storage_path) return
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

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'copy'
    e.dataTransfer.setData('application/x-messenger-attachment', 'true')
    e.dataTransfer.setData(
      'application/x-messenger-attachment-json',
      JSON.stringify({
        file_id: attachment.file_id,
        file_name: attachment.file_name,
        storage_path: attachment.storage_path,
        file_size: attachment.file_size,
        mime_type: attachment.mime_type,
      }),
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!(projectId && workspaceId)}
      onDragStart={handleDragStart}
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded-lg border cursor-pointer transition-colors',
        isFailed
          ? 'bg-red-50 border-red-200 hover:bg-red-100'
          : isDraft
            ? 'bg-gray-100 border-gray-200 hover:bg-gray-150'
            : isOwn
              ? 'bg-white/15 border-white/20 hover:bg-white/25'
              : 'bg-background/50 border-border hover:bg-muted/50',
      )}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleOpen()
        }
      }}
    >
      {!attachment.storage_path ? (
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-white/50" />
      ) : (
        <FileText
          className={cn(
            'h-5 w-5 shrink-0',
            isFailed
              ? 'text-red-400'
              : isDraft
                ? 'text-gray-400'
                : isOwn
                  ? 'text-white/70'
                  : 'text-muted-foreground',
          )}
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{attachment.file_name}</p>
        {attachment.file_size && (
          <p
            className={cn(
              'text-[10px]',
              isFailed
                ? 'text-red-400'
                : isDraft
                  ? 'text-gray-400'
                  : isOwn
                    ? 'text-white/60'
                    : 'text-muted-foreground',
            )}
          >
            {formatSize(attachment.file_size)}
          </p>
        )}
      </div>
      <AttachmentMenuButton
        attachment={attachment}
        isOwn={isOwn}
        projectId={projectId}
        workspaceId={workspaceId}
        openLabel="Открыть документ"
        loading={loading}
        setLoading={setLoading}
      />
    </div>
  )
}
