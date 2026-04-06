"use client"

/**
 * Toast content builder for new message notifications.
 * Uses createElement directly to avoid React component dependency in module scope.
 */
import { createElement } from 'react'
import Image from 'next/image'
import { getInitials, getAvatarColor } from '@/utils/avatarHelpers'

// SVG icons (inline, no lucide dependency in module scope)
const iconClose = createElement(
  'svg',
  {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  createElement('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
  createElement('line', { x1: 6, y1: 6, x2: 18, y2: 18 }),
)

const iconCheck = createElement(
  'svg',
  {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  },
  createElement('polyline', { points: '20 6 9 17 4 12' }),
)

/** Avatar: Image if URL available, otherwise colored circle with initials */
function buildAvatar(senderName: string, avatarUrl: string | null) {
  const size = 'w-8 h-8 rounded-full shrink-0'
  if (avatarUrl) {
    return createElement(Image, {
      src: avatarUrl,
      alt: senderName,
      width: 32,
      height: 32,
      className: `${size} object-cover`,
    })
  }
  return createElement(
    'div',
    {
      className: `${size} flex items-center justify-center text-xs font-medium ${getAvatarColor(senderName)}`,
    },
    getInitials(senderName),
  )
}

/** Маппинг accent_color чата → Tailwind border-цвет */
const ACCENT_BORDER: Record<string, string> = {
  blue: 'border-blue-400',
  slate: 'border-stone-400',
  emerald: 'border-emerald-400',
  amber: 'border-amber-400',
  rose: 'border-rose-400',
  violet: 'border-violet-400',
  orange: 'border-orange-400',
  cyan: 'border-cyan-400',
  pink: 'border-pink-400',
  indigo: 'border-indigo-400',
}

/** Build toast content: avatar + message lines + action buttons */
export function buildToastContent(
  lines: string[],
  projectName: string,
  senderName: string,
  avatarUrl: string | null,
  channel: 'client' | 'internal',
  onOpen: () => void,
  onMarkRead: () => void,
  onDismiss: () => void,
  accentColor?: string | null,
) {
  const borderColor = accentColor
    ? (ACCENT_BORDER[accentColor] ?? 'border-blue-400')
    : channel === 'internal'
      ? 'border-gray-800'
      : 'border-blue-400'
  return createElement(
    'div',
    {
      className: `flex items-start gap-3 bg-white rounded-lg shadow-lg border-2 ${borderColor} px-4 py-3 text-foreground cursor-pointer`,
      style: { width: 420 },
      onClick: onOpen,
    },
    buildAvatar(senderName, avatarUrl),
    createElement(
      'div',
      { className: 'flex-1 min-w-0' },
      createElement(
        'div',
        { className: 'font-medium text-sm' },
        senderName,
        createElement(
          'span',
          { className: 'font-normal text-muted-foreground ml-1' },
          `(${projectName})`,
        ),
      ),
      createElement(
        'div',
        { className: 'flex flex-col gap-0.5 mt-0.5' },
        ...lines.map((line, i) =>
          createElement(
            'div',
            { key: i, className: 'text-xs text-muted-foreground break-words' },
            line,
          ),
        ),
      ),
    ),
    createElement(
      'div',
      { className: 'flex items-center gap-0.5 shrink-0 -mt-0.5 -mr-1' },
      createElement(
        'button',
        {
          type: 'button',
          title: 'Прочитано',
          className:
            'toast-actions p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors',
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation()
            onMarkRead()
          },
        },
        iconCheck,
      ),
      createElement(
        'button',
        {
          type: 'button',
          title: 'Закрыть',
          className:
            'p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors',
          onClick: (e: { stopPropagation: () => void }) => {
            e.stopPropagation()
            onDismiss()
          },
        },
        iconClose,
      ),
    ),
  )
}
