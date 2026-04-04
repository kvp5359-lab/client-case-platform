/**
 * Компонент для единообразной структуры колонок таблицы документов
 */

import { TABLE_COLUMN_WIDTHS } from './types'

export function TableColgroup() {
  return (
    <colgroup>
      <col style={{ width: TABLE_COLUMN_WIDTHS.nameColumn }} />
      <col style={{ width: TABLE_COLUMN_WIDTHS.sizeColumn }} />
      <col style={{ width: TABLE_COLUMN_WIDTHS.dateColumn }} />
      <col style={{ width: TABLE_COLUMN_WIDTHS.descColumn }} />
    </colgroup>
  )
}
