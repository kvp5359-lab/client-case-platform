"use client"

/**
 * Дропдаун выбора статуса документа — разделён на иконку и текстовый тег,
 * чтобы их можно было размещать в разных местах строки.
 */

import { memo } from 'react'
import { safeCssColor } from '@/utils/isValidCssColor'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DocumentStatusIcon } from './DocumentStatusIcon'
import type { DocumentStatus } from '@/components/documents/types'

/** Общий контент дропдауна */
function StatusMenuItems({
  statuses,
  documentId,
  onStatusChange,
}: {
  statuses: DocumentStatus[]
  documentId: string
  onStatusChange: (documentId: string, statusId: string | null) => void
}) {
  return (
    <DropdownMenuContent align="start" className="w-48">
      <DropdownMenuItem
        onClick={(e) => {
          e.stopPropagation()
          onStatusChange(documentId, null)
        }}
        className="flex items-center gap-2"
      >
        <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gray-300" />
        <span className="text-gray-500">Не выбран</span>
      </DropdownMenuItem>
      {statuses.map((status) => (
        <DropdownMenuItem
          key={status.id}
          onClick={(e) => {
            e.stopPropagation()
            onStatusChange(documentId, status.id)
          }}
          className="flex items-center gap-2"
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: safeCssColor(status.color) }}
          />
          <span>{status.name}</span>
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  )
}

interface StatusIconDropdownProps {
  documentId: string
  currentStatus: DocumentStatus | null
  statuses: DocumentStatus[]
  onStatusChange: (documentId: string, statusId: string | null) => void
}

/** Кружок-иконка статуса (слева от имени) */
export const DocumentStatusIconDropdown = memo(function DocumentStatusIconDropdown({
  documentId,
  currentStatus,
  statuses,
  onStatusChange,
}: StatusIconDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full hover:ring-2 hover:ring-gray-300 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <DocumentStatusIcon status={currentStatus} />
        </button>
      </DropdownMenuTrigger>
      <StatusMenuItems
        statuses={statuses}
        documentId={documentId}
        onStatusChange={onStatusChange}
      />
    </DropdownMenu>
  )
})

interface StatusLabelDropdownProps {
  documentId: string
  currentStatus: DocumentStatus | null
  statuses: DocumentStatus[]
  statusBgColor: string
  onStatusChange: (documentId: string, statusId: string | null) => void
}

/** Текстовый тег статуса (справа от имени) */
export const DocumentStatusLabelDropdown = memo(function DocumentStatusLabelDropdown({
  documentId,
  currentStatus,
  statuses,
  statusBgColor,
  onStatusChange,
}: StatusLabelDropdownProps) {
  const statusColor = currentStatus ? safeCssColor(currentStatus.color) : null

  if (currentStatus) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[13px] leading-tight cursor-pointer hover:opacity-80 transition-opacity"
            style={{
              backgroundColor: statusBgColor,
              color: statusColor || '#9ca3af',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {currentStatus.name}
          </button>
        </DropdownMenuTrigger>
        <StatusMenuItems
          statuses={statuses}
          documentId={documentId}
          onStatusChange={onStatusChange}
        />
      </DropdownMenu>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border border-gray-200 text-[13px] leading-tight cursor-pointer text-gray-400 hover:text-gray-500 hover:border-gray-300 hover:bg-gray-50 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          Статус не выбран
        </button>
      </DropdownMenuTrigger>
      <StatusMenuItems
        statuses={statuses}
        documentId={documentId}
        onStatusChange={onStatusChange}
      />
    </DropdownMenu>
  )
})

/** Комбинированный компонент (кружок + тег вместе) — для обратной совместимости */
export const DocumentStatusDropdown = memo(function DocumentStatusDropdown({
  documentId,
  currentStatus,
  statuses,
  statusBgColor,
  onStatusChange,
}: StatusLabelDropdownProps) {
  return (
    <>
      <DocumentStatusIconDropdown
        documentId={documentId}
        currentStatus={currentStatus}
        statuses={statuses}
        onStatusChange={onStatusChange}
      />
      <DocumentStatusLabelDropdown
        documentId={documentId}
        currentStatus={currentStatus}
        statuses={statuses}
        statusBgColor={statusBgColor}
        onStatusChange={onStatusChange}
      />
    </>
  )
})
