"use client"

import { useState } from 'react'
import { Check, Loader2, Eye, EyeOff, SquareArrowOutUpRight } from 'lucide-react'
import { formatSize } from '@/utils/files/formatSize'
import { formatNumericDate } from '@/utils/format/dateFormat'
import { useToggleKitSourceHidden } from '@/hooks/documents/useSourceDocumentsQuery'
import type { SourceDocument } from '@/types/documents'

/**
 * Строка файла из источника Google Drive в «лотке» набора.
 * Имя + размер + дата загрузки. Кнопка «Принять» (видна на hover) загружает
 * файл в набор в нужную папку. Перетаскивание — отдельный путь.
 */
export function KitSourceFileRow({
  doc,
  onAccept,
}: {
  doc: SourceDocument
  /** Принять файл в набор (в папку). Не задан → кнопки нет (напр. корневые файлы). */
  onAccept?: () => Promise<void> | void
}) {
  const [isAccepting, setIsAccepting] = useState(false)
  const toggleHidden = useToggleKitSourceHidden()
  const uploadedAt = doc.createdTime || doc.modifiedTime

  const handleAccept = async () => {
    if (isAccepting || !onAccept) return
    setIsAccepting(true)
    try {
      await onAccept()
    } finally {
      setIsAccepting(false)
    }
  }

  const isHidden = !!doc.isHidden

  return (
    <div
      className={
        'group/src flex items-center gap-2 px-1.5 py-1 rounded text-sm bg-muted/30 ' +
        (isHidden ? 'text-muted-foreground/40' : 'text-muted-foreground/90')
      }
      title={doc.name}
    >
      <span className="truncate min-w-0">{doc.name}</span>
      {doc.webViewLink && (
        <button
          type="button"
          onClick={() =>
            window.open(doc.webViewLink, '_blank', 'noopener,noreferrer')
          }
          className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted opacity-0 group-hover/src:opacity-100 transition-opacity"
          title="Открыть документ"
          aria-label="Открыть документ"
        >
          <SquareArrowOutUpRight className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() =>
          toggleHidden.mutate({ sourceDocId: doc.sourceDocumentId, hidden: isHidden })
        }
        disabled={toggleHidden.isPending}
        className={
          'shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-opacity ' +
          (isHidden ? 'opacity-100' : 'opacity-0 group-hover/src:opacity-100')
        }
        title={isHidden ? 'Показать файл' : 'Скрыть файл'}
        aria-label={isHidden ? 'Показать файл' : 'Скрыть файл'}
      >
        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      {onAccept && (
        <button
          type="button"
          onClick={handleAccept}
          disabled={isAccepting}
          className="shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 opacity-0 group-hover/src:opacity-100 transition-opacity disabled:opacity-100"
          title="Принять файл в набор"
        >
          {isAccepting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Check className="h-3 w-3" />
          )}
          Принять
        </button>
      )}
      <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
        {formatSize(doc.size ?? null)}
        {uploadedAt && ` · ${formatNumericDate(uploadedAt)}`}
      </span>
    </div>
  )
}
