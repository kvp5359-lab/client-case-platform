import { useState, useEffect, useCallback, type ReactNode } from 'react'
import Image from 'next/image'
import { Loader2, ImageOff } from 'lucide-react'
import {
  downloadAttachmentBlob,
  type MessageAttachment as AttachmentType,
} from '@/services/api/messenger/messengerService'
import { isImage, isAudio } from '@/lib/messenger/attachmentHelpers'
import { ImageLightbox } from './ImageLightbox'
import { AttachmentMenuButton } from './AttachmentMenuButton'
import { AudioAttachmentPlayer } from './AudioAttachmentPlayer'
import { FileAttachment } from './FileAttachment'

// Re-export for external consumers
export { isAudio } from '@/lib/messenger/attachmentHelpers'

/**
 * Wrapper: splits images (grid), audios, and files (list)
 */
type MessageAttachmentsProps = {
  attachments: AttachmentType[]
  isOwn?: boolean
  isDraft?: boolean
  isFailed?: boolean
  projectId?: string
  workspaceId?: string
  /** Тред сообщения — нужен для удаления отдельного файла. */
  threadId?: string
  /** Оверлей в правом нижнем углу последней картинки (обычно — таймстамп). */
  imageTimestampOverlay?: ReactNode
  /** Таймстамп, встраиваемый в строку ЕДИНСТВЕННОГО файла (без картинок/аудио),
   *  чтобы не оставлять пустой «подвал» под баблом. */
  fileTimestamp?: ReactNode
  /** Убрать верхний отступ у первого блока (бабл только из вложений — padding
   *  бабла даёт равномерный отступ). */
  flushTop?: boolean
}

export function MessageAttachments({
  attachments,
  isOwn,
  isDraft,
  isFailed,
  projectId,
  workspaceId,
  threadId,
  imageTimestampOverlay,
  fileTimestamp,
  flushTop,
}: MessageAttachmentsProps) {
  const images = attachments.filter((a) => isImage(a.mime_type))
  const audios = attachments.filter((a) => isAudio(a.mime_type))
  const files = attachments.filter((a) => !isImage(a.mime_type) && !isAudio(a.mime_type))
  // Первый непустой блок — у него убираем верхний mt при flushTop.
  const firstBlock = images.length > 0 ? 'images' : audios.length > 0 ? 'audios' : 'files'
  const topMargin = (block: 'images' | 'audios' | 'files') =>
    flushTop && firstBlock === block ? 'mt-0' : 'mt-1.5'

  return (
    <>
      {images.length > 0 && (
        <div
          className={`grid gap-1.5 ${topMargin('images')}`}
          style={{
            gridTemplateColumns:
              images.length === 1
                ? '1fr'
                : images.length === 2
                  ? 'repeat(2, 1fr)'
                  : 'repeat(3, 1fr)',
          }}
        >
          {images.map((att, idx) => (
            <ImageAttachment
              key={att.id}
              attachment={att}
              isOwn={isOwn}
              projectId={projectId}
              workspaceId={workspaceId}
              threadId={threadId}
              timestampOverlay={
                idx === images.length - 1 ? imageTimestampOverlay : undefined
              }
            />
          ))}
        </div>
      )}
      {audios.length > 0 && (
        <div className={`space-y-1 ${topMargin('audios')}`}>
          {audios.map((att) => (
            <AudioAttachmentPlayer key={att.id} attachment={att} isOwn={isOwn} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className={`space-y-1 ${topMargin('files')}`}>
          {files.map((att, idx) => (
            <FileAttachment
              key={att.id}
              attachment={att}
              isOwn={isOwn}
              isDraft={isDraft}
              isFailed={isFailed}
              projectId={projectId}
              workspaceId={workspaceId}
              threadId={threadId}
              // Время — оверлеем в правом нижнем углу ПОСЛЕДНЕГО файла.
              timestamp={idx === files.length - 1 ? fileTimestamp : undefined}
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
  isOwn,
  projectId,
  workspaceId,
  threadId,
  timestampOverlay,
}: {
  attachment: AttachmentType
  isOwn?: boolean
  projectId?: string
  workspaceId?: string
  threadId?: string
  timestampOverlay?: ReactNode
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
          <div className="absolute top-1 right-1 md:opacity-0 md:group-hover/img:opacity-100 transition-opacity">
            <AttachmentMenuButton
              attachment={attachment}
              isOwn={isOwn}
              projectId={projectId}
              workspaceId={workspaceId}
              threadId={threadId}
              onOpen={() => setLightboxOpen(true)}
              openLabel="Открыть изображение"
              loading={menuLoading}
              setLoading={setMenuLoading}
            />
          </div>
          {timestampOverlay && (
            <div className="absolute bottom-1 right-1 z-10 pointer-events-none">
              {timestampOverlay}
            </div>
          )}
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

      {lightboxOpen && previewUrl && (
        <ImageLightbox src={previewUrl} alt={attachment.file_name} onClose={closeLightbox} />
      )}
    </div>
  )
}
