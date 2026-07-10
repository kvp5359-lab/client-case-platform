import { useState, useCallback } from 'react'
import Image from 'next/image'
import { Loader2, ImageOff, CornerDownRight } from 'lucide-react'
import type { MessageAttachment } from '@/services/api/messenger/messengerService'
import { useAttachmentPreview } from '../hooks/useAttachmentPreview'
import { ImageLightbox } from '../ImageLightbox'

/** Квадратная плитка картинки в галерее поиска: превью → лайтбокс, кнопка «к сообщению». */
export function GalleryImageTile({
  attachment,
  onJump,
}: {
  attachment: MessageAttachment
  onJump: () => void
}) {
  const { previewUrl, loading } = useAttachmentPreview(attachment)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const closeLightbox = useCallback(() => setLightboxOpen(false), [])

  return (
    <div className="group/tile relative aspect-square overflow-hidden rounded-md bg-muted/50">
      {loading ? (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : previewUrl ? (
        <button
          type="button"
          aria-label={`Открыть ${attachment.file_name}`}
          onClick={() => setLightboxOpen(true)}
          className="block h-full w-full"
        >
          <Image
            src={previewUrl}
            alt={attachment.file_name}
            width={160}
            height={160}
            unoptimized
            className="h-full w-full object-cover transition-opacity hover:opacity-90"
          />
        </button>
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-muted-foreground" />
        </div>
      )}

      <button
        type="button"
        onClick={onJump}
        aria-label="Перейти к сообщению"
        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/65 group-hover/tile:opacity-100"
      >
        <CornerDownRight className="h-3.5 w-3.5" />
      </button>

      {lightboxOpen && previewUrl && (
        <ImageLightbox src={previewUrl} alt={attachment.file_name} onClose={closeLightbox} />
      )}
    </div>
  )
}
