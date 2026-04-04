/**
 * Строка-индикатор загрузки документа из источника (рендерится внутри <tbody>)
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface UploadProgressRowProps {
  phase: 'downloading' | 'uploading' | null
}

export function UploadProgressRow({ phase }: UploadProgressRowProps) {
  return (
    <tr>
      <td colSpan={2} className="p-0">
        <div className="mx-1 my-0.5 overflow-hidden rounded-md border border-purple-200 bg-purple-50">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-purple-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span className="truncate">
              {phase === 'downloading'
                ? 'Скачивание с Google Drive...'
                : phase === 'uploading'
                  ? 'Загрузка в хранилище...'
                  : 'Подготовка...'}
            </span>
          </div>
          <div className="h-1 bg-purple-100">
            <div
              className={cn(
                'h-full bg-purple-500 transition-all duration-500',
                phase === 'downloading' && 'w-2/5 animate-pulse',
                phase === 'uploading' && 'w-4/5 animate-pulse',
                !phase && 'w-1/6 animate-pulse',
              )}
            />
          </div>
        </div>
      </td>
    </tr>
  )
}
