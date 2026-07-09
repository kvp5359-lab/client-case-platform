"use client"

import { useState } from 'react'
import { Check, Loader2, Eye, EyeOff, SquareArrowOutUpRight } from 'lucide-react'
import { formatSize } from '@/utils/files/formatSize'
import { formatSmartDate } from '@/utils/format/dateFormat'
import { useToggleKitSourceHidden } from '@/hooks/documents/useSourceDocumentsQuery'
import { useDocumentsContext } from './DocumentsContext'
import type { SourceDocument } from '@/types/documents'

/**
 * Строка файла из источника Google Drive в «лотке» набора.
 * Табличная строка (tr) с теми же колонками, что документы набора (DocumentItem):
 * имя + действия / размер / дата — колонки выровнены. Строка перетаскиваемая.
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
  const { fileSizeWarnMb, fileSizeDangerMb } = useDocumentsContext()
  const uploadedAt = doc.createdTime || doc.modifiedTime

  // Подсветка размера по порогам шаблона проекта — как у документов набора.
  const sizeMb = (doc.size ?? 0) / (1024 * 1024)
  const sizeColorClass =
    fileSizeDangerMb != null && sizeMb >= fileSizeDangerMb
      ? 'text-red-500 font-medium'
      : fileSizeWarnMb != null && sizeMb >= fileSizeWarnMb
        ? 'text-amber-500 font-medium'
        : 'text-gray-400'

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
    <tr
      draggable
      onDragStart={(e) => {
        // Тот же контракт, что у файлов из правой панели — папки/слоты/документы
        // уже принимают этот MIME (useFolderCardDragDrop, SlotItem, DocumentItem).
        e.dataTransfer.setData('application/x-source-doc', 'true')
        e.dataTransfer.setData(
          'application/x-source-doc-json',
          JSON.stringify({
            id: doc.id,
            name: doc.name,
            sourceDocumentId: doc.sourceDocumentId,
          }),
        )
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={
        'group/src odd:bg-gray-50/60 cursor-grab active:cursor-grabbing hover:bg-gray-100/60 transition-colors ' +
        (isHidden ? 'text-muted-foreground/40' : 'text-muted-foreground/90')
      }
      title={doc.name}
    >
      {/* Пустая колонка чекбокса — для выравнивания с документами набора */}
      <td className="py-0.5 pl-0 pr-0.5 w-0 align-middle" />
      {/* Имя + действия */}
      <td className="py-0.5 pl-0.5 pr-1 text-gray-500 align-middle">
        <div className="flex items-center gap-2 min-w-0" style={{ minHeight: 20 }}>
          <span className="truncate min-w-0 text-[15px] leading-tight text-gray-400 pointer-events-none">
            {doc.name}
          </span>
          {doc.webViewLink && (
            <button
              type="button"
              onClick={() => window.open(doc.webViewLink, '_blank', 'noopener,noreferrer')}
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
        </div>
      </td>
      {/* Размер */}
      <td className="py-0.5 pl-2 pr-1 text-right align-middle whitespace-nowrap w-[80px]">
        <div
          className={`flex items-center justify-end min-h-[20px] pl-2 text-[12px] tabular-nums ${sizeColorClass}`}
        >
          {formatSize(doc.size ?? null)}
        </div>
      </td>
      {/* Дата загрузки */}
      <td className="py-0.5 pl-1 pr-1 md:pr-2.5 text-right align-middle whitespace-nowrap w-[80px]">
        <div className="flex items-center justify-end min-h-[20px] pl-1.5 text-[12px] tabular-nums text-gray-400">
          {uploadedAt ? formatSmartDate(uploadedAt) : ''}
        </div>
      </td>
    </tr>
  )
}
