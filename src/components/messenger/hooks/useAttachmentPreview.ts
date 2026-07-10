"use client"

import { useState, useEffect } from 'react'
import {
  downloadAttachmentBlob,
  type MessageAttachment,
} from '@/services/api/messenger/messengerService'

/**
 * Загружает blob-превью вложения из Storage и следит за его жизненным циклом
 * (revoke URL при размонтаже/смене). Общий примитив для плиток картинок —
 * рендер (раскладка, лайтбокс, меню) остаётся в компоненте.
 *
 * ⚠️ Использовать с `key={attachment.id}` на компоненте: гейт `if (previewUrl)`
 * не перезагружает превью при смене вложения в том же инстансе (ожидается
 * remount по key, как в GalleryImageTile / ImageAttachment).
 */
export function useAttachmentPreview(
  attachment: Pick<MessageAttachment, 'storage_path' | 'file_id'>,
) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!attachment.storage_path)
  const [error, setError] = useState(false)

  useEffect(() => {
    // Нет пути — грузить нечего; loading инициализирован false (см. useState).
    if (!attachment.storage_path) return
    if (previewUrl || error) return
    let cancelled = false
    downloadAttachmentBlob(attachment.storage_path, attachment.file_id)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url)
          return
        }
        setPreviewUrl(url)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError(true)
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [attachment.storage_path, attachment.file_id, previewUrl, error])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  return { previewUrl, loading, error }
}
