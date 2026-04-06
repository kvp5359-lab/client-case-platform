import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { Loader2, ImageOff } from 'lucide-react'
import {
  downloadAttachmentBlob,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messenger/messengerService'
import { formatSize } from '@/utils/files/formatSize'
import { isImage, isAudio } from './utils/attachmentHelpers'
import { ImageLightbox } from './ImageLightbox'
import { AttachmentMenuButton } from './AttachmentMenuButton'
import { AudioAttachmentPlayer } from './AudioAttachmentPlayer'
import { FileAttachment } from './FileAttachment'

// Re-export for external consumers
export { isAudio } from './utils/attachmentHelpers'

/**
 * Wrapper: splits images (grid), audios, and files (list)
 */
interface MessageAttachmentsProps {
  attachments: AttachmentType[]
  isOwn?: boolean
  isDraft?: boolean
  isFailed?: boolean
  projectId?: string
  workspaceId?: string
}

export function MessageAttachments({
  attachments,
  isOwn,
  isDraft,
  isFailed,
  projectId,
  workspaceId,
}: MessageAttachmentsProps) {
  const images = attachments.filter((a) => isImage(a.mime_type))
  const audios = attachments.filter((a) => isAudio(a.mime_type))
  const files = attachments.filter((a) => !isImage(a.mime_type) && !isAudio(a.mime_type))

  return (
    <>
      {images.length > 0 && (
        <div
          className="grid gap-1.5 mt-1.5"
          style={{
            gridTemplateColumns:
              images.length === 1
                ? '1fr'
                : images.length === 2
                  ? 'repeat(2, 1fr)'
                  : 'repeat(3, 1fr)',
          }}
        >
          {images.map((att) => (
            <ImageAttachment
              key={att.id}
              attachment={att}
              projectId={projectId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
      {audios.length > 0 && (
        <div className="space-y-1 mt-1.5">
          {audios.map((att) => (
            <AudioAttachmentPlayer key={att.id} attachment={att} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="space-y-1 mt-1.5">
          {files.map((att) => (
            <FileAttachment
              key={att.id}
              attachment={att}
              isOwn={isOwn}
              isDraft={isDraft}
              isFailed={isFailed}
              projectId={projectId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </>
  )
}

/**
 * Image preview with lightbox
 */
function ImageAttachment({
  attachment,
  projectId,
  workspaceId,
}: {
  attachment: AttachmentType
  projectId?: string
  workspaceId?: string
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(!!attachment.storage_path)
  const [previewError, setPreviewError] = useState(false)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [menuLoading, setMenuLoading] = useState(false)

  useEffect(() => {
    if (!attachment.storage_path) return
    if (previewUrl || previewError) return

    let cancelled = false

    downloadAttachmentBlob(attachment.storage_path, attachment.file_id)
      .then((blobUrl) => {
        if (!cancelled) {
          setPreviewUrl(blobUrl)
          setPreviewLoading(false)
        } else {
          URL.revokeObjectURL(blobUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewError(true)
          setPreviewLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [attachment.storage_path, attachment.file_id, previewUrl, previewError])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const closeLightbox = useCallback(() => setLightboxOpen(false), [])

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

  const heightClass = 'h-[100px]'
  const placeholderClass = 'h-[100px]'

  return (
    <div className="min-w-0" draggable={!!(projectId && workspaceId)} onDragStart={handleDragStart}>
      {previewLoading ? (
        <div
          className={`w-full ${placeholderClass} rounded-lg bg-muted/50 flex items-center justify-center`}
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : previewUrl ? (
        <div className="relative group/img">
          <button
            type="button"
            aria-label={`Открыть ${attachment.file_name}`}
            onClick={() => setLightboxOpen(true)}
            className="block w-full"
          >
            <Image
              src={previewUrl}
              alt={attachment.file_name}
              width={300}
              height={100}
              draggable={false}
              unoptimized
              className={`w-full ${heightClass} rounded-lg object-cover cursor-pointer hover:opacity-90 transition-opacity`}
            />
          </button>
          {/* Menu overlay */}
          <div className="absolute top-1 right-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
            <AttachmentMenuButton
              attachment={attachment}
              projectId={projectId}
              workspaceId={workspaceId}
              onOpen={() => setLightboxOpen(true)}
              openLabel="Открыть изображение"
              loading={menuLoading}
              setLoading={setMenuLoading}
            />
          </div>
        </div>
      ) : previewError ? (
        <div
          className={`w-full ${placeholderClass} rounded-lg bg-muted/50 flex items-center justify-center`}
        >
          <ImageOff className="h-4 w-4 text-muted-foreground" />
        </div>
      ) : !attachment.storage_path ? (
        <div
          className={`w-full ${placeholderClass} rounded-lg bg-muted/50 flex items-center justify-center`}
        >
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      <p className="text-[10px] opacity-50 mt-0.5 truncate">
        {attachment.file_name}
        {attachment.file_size ? ` · ${formatSize(attachment.file_size)}` : ''}
      </p>

      {lightboxOpen && previewUrl && (
        <ImageLightbox src={previewUrl} alt={attachment.file_name} onClose={closeLightbox} />
      )}
    </div>
  )
}
