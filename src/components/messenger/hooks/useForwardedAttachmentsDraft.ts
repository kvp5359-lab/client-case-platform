import { useCallback, useEffect, useState } from 'react'
import type { ForwardedAttachment } from '@/services/api/messenger/messengerService'

/**
 * Пересланные вложения (буфер пересылки → чипы композера) — персистятся в
 * localStorage по треду, как и текстовый черновик (`msg_draft:<threadId>`).
 * Без этого при переходе на другой диалог и обратно вставленные файлы пропадали:
 * текст сохранялся в черновик, а `forwardedAttachments` был эфемерным useState
 * и терялся при перемонтировании компонента.
 *
 * Это просто метаданные (`file_id`/`storage_path`), полностью сериализуемые —
 * в отличие от настоящих `File` в composer'е.
 */
const keyFor = (threadId: string) => `fwd_attachments:${threadId}`

function read(threadId: string): ForwardedAttachment[] {
  if (typeof window === 'undefined' || !threadId) return []
  try {
    const raw = localStorage.getItem(keyFor(threadId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ForwardedAttachment[]) : []
  } catch {
    return []
  }
}

type Updater = ForwardedAttachment[] | ((prev: ForwardedAttachment[]) => ForwardedAttachment[])

export function useForwardedAttachmentsDraft(
  threadId: string,
): readonly [ForwardedAttachment[], (u: Updater) => void] {
  const [items, setItemsState] = useState<ForwardedAttachment[]>(() => read(threadId))

  // Смена треда без перемонтирования — перечитываем черновик нового треда.
  // setState отложен через queueMicrotask (как в useDraftMessage) — иначе
  // синхронный setState в эффекте ловится линтером.
  useEffect(() => {
    queueMicrotask(() => setItemsState(read(threadId)))
  }, [threadId])

  const setItems = useCallback(
    (u: Updater) => {
      setItemsState((prev) => {
        const next = typeof u === 'function' ? u(prev) : u
        try {
          if (next.length > 0) localStorage.setItem(keyFor(threadId), JSON.stringify(next))
          else localStorage.removeItem(keyFor(threadId))
        } catch {
          /* localStorage недоступен — переживём без персиста */
        }
        return next
      })
    },
    [threadId],
  )

  return [items, setItems] as const
}
