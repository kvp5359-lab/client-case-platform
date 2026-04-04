"use client"

/**
 * Единая таблица для системных секций (Новые, Источник, Экспорт, Корзина).
 * Обеспечивает одинаковые колонки, отступы и стиль для всех вкладок.
 */

import type { ReactNode } from 'react'

interface SystemSectionTableProps {
  children: ReactNode
}

export function SystemSectionTable({ children }: SystemSectionTableProps) {
  return (
    <div className="px-2">
      <table className="w-full table-fixed border-collapse">
        <colgroup>
          <col style={{ width: '75%' }} />
          <col style={{ width: '14%' }} />
          <col style={{ width: '11%' }} />
        </colgroup>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
