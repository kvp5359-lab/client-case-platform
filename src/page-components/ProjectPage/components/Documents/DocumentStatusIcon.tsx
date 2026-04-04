"use client"

/**
 * Круглая иконка статуса документа — финальный, промежуточный, без статуса
 */

import { memo } from 'react'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { DocumentStatus } from '@/components/documents/types'

interface DocumentStatusIconProps {
  status: DocumentStatus | null
}

export const DocumentStatusIcon = memo(function DocumentStatusIcon({
  status,
}: DocumentStatusIconProps) {
  const statusColor = status ? safeCssColor(status.color) : null

  if (status?.is_final) {
    const color = statusColor || '#22c55e'
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="2" fill="white" />
        <path
          d="M5 8.2 L7.2 10.4 L11 5.6"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    )
  }

  if (!status) {
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6.5" stroke="#9ca3af" strokeWidth="2" opacity="0.35" />
      </svg>
    )
  }

  const color = statusColor || '#9ca3af'
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke={color} strokeWidth="2" opacity="0.2" />
      <path
        d="M 13.63 11.25 A 6.5 6.5 0 1 1 8 1.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
})
