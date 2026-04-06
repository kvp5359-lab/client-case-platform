/**
 * Компонент строки документа из папки назначения (Google Drive)
 */

import Image from 'next/image'
import { DestinationDocument } from './types'
import { formatSize } from '@/utils/formatSize'
import { formatShortDate } from '@/utils/dateFormat'

interface DestinationDocumentRowProps {
  file: DestinationDocument
}

export function DestinationDocumentRow({ file }: DestinationDocumentRowProps) {
  return (
    <tr className="group h-7 hover:bg-muted/30">
      {/* Колонка: Название */}
      <td className="py-1 pl-1.5 pr-3 border-b border-gray-100">
        <div className="flex items-center gap-2 min-w-0">
          {file.iconLink && <Image src={file.iconLink} alt="" width={16} height={16} className="w-4 h-4 flex-shrink-0" />}
          <span className="text-sm truncate flex-1 min-w-0 text-green-700">{file.name}</span>
        </div>
      </td>

      {/* Колонка: Размер */}
      <td className="py-1 px-3 relative text-xs text-gray-400 text-right border-b border-gray-100">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
        {file.size ? formatSize(file.size) : '—'}
      </td>

      {/* Колонка: Дата */}
      <td className="py-1 pr-3 pl-2 relative text-xs text-gray-400 text-right border-b border-gray-100">
        <div className="absolute left-0 top-2 bottom-2 w-px bg-border" />
        {formatShortDate(file.createdTime) || '—'}
      </td>
    </tr>
  )
}
