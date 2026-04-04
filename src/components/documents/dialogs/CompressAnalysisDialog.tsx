"use client"

/**
 * Диалог анализа потенциального сжатия PDF-документов
 * Эвристическая оценка без реального вызова API
 */

import { useMemo } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatSize } from '@/utils/formatSize'
import type { DocumentWithFiles } from '@/components/documents/types'

export interface CompressAnalysisItem {
  docId: string
  docName: string
  currentSize: number
  estimatedSize: number
  savingsPercent: number
  folderName: string | null
}

interface CompressAnalysisDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: CompressAnalysisItem[]
  onHighlight: (docIds: string[]) => void
}

/**
 * Эвристическая оценка сжатия PDF:
 * - PDF < 100 КБ — вероятно текстовый, сжатие ~5-10%
 * - PDF 100 КБ - 500 КБ — мало графики, сжатие ~15-25%
 * - PDF 500 КБ - 2 МБ — средний файл, сжатие ~25-40%
 * - PDF 2 МБ - 10 МБ — много графики, сжатие ~35-55%
 * - PDF > 10 МБ — тяжёлый файл (сканы), сжатие ~45-65%
 */
export function estimateCompression(sizeBytes: number): {
  estimatedSize: number
  savingsPercent: number
} {
  if (sizeBytes <= 0) return { estimatedSize: 0, savingsPercent: 0 }

  let savingsPercent: number

  if (sizeBytes < 100 * 1024) {
    savingsPercent = 8
  } else if (sizeBytes < 500 * 1024) {
    savingsPercent = 20
  } else if (sizeBytes < 2 * 1024 * 1024) {
    savingsPercent = 32
  } else if (sizeBytes < 10 * 1024 * 1024) {
    savingsPercent = 45
  } else {
    savingsPercent = 55
  }

  const estimatedSize = Math.round(sizeBytes * (1 - savingsPercent / 100))
  return { estimatedSize, savingsPercent }
}

/** Минимальный порог экономии для рекомендации сжатия (%) */
const MIN_SAVINGS_THRESHOLD = 15

export function CompressAnalysisDialog({
  open,
  onOpenChange,
  items,
  onHighlight,
}: CompressAnalysisDialogProps) {
  const compressibleItems = useMemo(
    () => items.filter((i) => i.savingsPercent >= MIN_SAVINGS_THRESHOLD),
    [items],
  )

  const totalCurrentSize = useMemo(
    () => compressibleItems.reduce((sum, i) => sum + i.currentSize, 0),
    [compressibleItems],
  )

  const totalEstimatedSize = useMemo(
    () => compressibleItems.reduce((sum, i) => sum + i.estimatedSize, 0),
    [compressibleItems],
  )

  const totalSavings = totalCurrentSize - totalEstimatedSize

  const handleHighlight = () => {
    onHighlight(compressibleItems.map((i) => i.docId))
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-blue-600" />
            Анализ сжатия документов
          </DialogTitle>
          <DialogDescription>Эвристическая оценка возможного сжатия PDF-файлов</DialogDescription>
        </DialogHeader>

        {items.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Нет PDF-документов для анализа
          </div>
        ) : (
          <div className="space-y-3">
            {/* Таблица */}
            <div className="max-h-72 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Документ</th>
                    <th className="text-right px-3 py-2 font-medium w-24">Сейчас</th>
                    <th className="text-right px-3 py-2 font-medium w-24">~После</th>
                    <th className="text-right px-3 py-2 font-medium w-20">Экономия</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isCompressible = item.savingsPercent >= MIN_SAVINGS_THRESHOLD
                    return (
                      <tr
                        key={item.docId}
                        className={isCompressible ? '' : 'text-muted-foreground'}
                      >
                        <td className="px-3 py-1.5 truncate max-w-[220px]" title={item.docName}>
                          <div className="flex items-center gap-1.5">
                            {isCompressible && (
                              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-green-500" />
                            )}
                            <span className="truncate">{item.docName}</span>
                          </div>
                          {item.folderName && (
                            <div className="text-[11px] text-muted-foreground/60 truncate">
                              {item.folderName}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {formatSize(item.currentSize)}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          ~{formatSize(item.estimatedSize)}
                        </td>
                        <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          <span
                            className={
                              isCompressible
                                ? 'text-green-600 font-medium'
                                : 'text-muted-foreground'
                            }
                          >
                            -{item.savingsPercent}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Итого */}
            {compressibleItems.length > 0 && (
              <div className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg text-sm">
                <span className="text-green-800">
                  Можно сжать: <strong>{compressibleItems.length}</strong> из {items.length} PDF
                </span>
                <span className="text-green-700 font-medium">
                  ~{formatSize(totalSavings)} экономии
                </span>
              </div>
            )}

            {compressibleItems.length === 0 && items.length > 0 && (
              <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-muted-foreground text-center">
                Все PDF-файлы уже достаточно компактны
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          {compressibleItems.length > 0 && (
            <Button onClick={handleHighlight}>Отметить документы для сжатия</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
