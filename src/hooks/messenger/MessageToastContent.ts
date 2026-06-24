"use client"

/**
 * Toast content builder for new message notifications.
 * Uses createElement directly to avoid React component dependency in module scope.
 */
import { createElement } from 'react'
import Image from 'next/image'
import { getInitials, getAvatarColor } from '@/utils/avatarHelpers'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'

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

/** Avatar: Image if URL available, otherwise colored circle with initials.
 *  Если задана иконка треда — рисуем маленький бейдж в правом нижнем углу. */
function buildAvatar(
  senderName: string,
  avatarUrl: string | null,
  threadIcon?: string | null,
) {
  const size = 'w-8 h-8 rounded-full'
  const inner = avatarUrl
    ? createElement(Image, {
        src: avatarUrl,
        alt: senderName,
        width: 32,
        height: 32,
        className: `${size} object-cover`,
      })
    : createElement(
        'div',
        {
          className: `${size} flex items-center justify-center text-xs font-medium ${getAvatarColor(senderName)}`,
        },
        getInitials(senderName),
      )

  if (!threadIcon) {
    return createElement('div', { className: 'shrink-0' }, inner)
  }

  const IconComp = getChatIconComponent(threadIcon)
  const badge = createElement(
    'div',
    {
      className:
        'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white border border-border flex items-center justify-center text-foreground/80',
    },
    createElement(IconComp, { width: 10, height: 10, className: 'w-2.5 h-2.5' }),
  )

  return createElement('div', { className: 'relative shrink-0' }, inner, badge)
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
  /** null/пустая строка — личный диалог, суффикс в скобках не показываем. */
  projectName: string | null,
  /** Имя треда/задачи. Дописывается в скобки после проекта: `(Проект · Тред)`.
   *  Показывается только когда есть projectName (для личных диалогов — нет). */
  threadName: string | null,
  senderName: string,
  avatarUrl: string | null,
  channel: 'client' | 'internal',
  onOpen: () => void,
  onMarkRead: () => void,
  onDismiss: () => void,
  accentColor?: string | null,
  threadIcon?: string | null,
) {
  const borderColor = accentColor
    ? (ACCENT_BORDER[accentColor] ?? 'border-blue-400')
    : channel === 'internal'
      ? 'border-gray-800'
      : 'border-blue-400'
  return createElement(
    'div',
    {
      className: `relative flex items-start gap-3 bg-white rounded-lg shadow-lg border-2 ${borderColor} px-4 py-3 text-foreground cursor-pointer`,
      style: { width: 420 },
      onClick: onOpen,
    },
    buildAvatar(senderName, avatarUrl, threadIcon),
    createElement(
      'div',
      { className: 'flex-1 min-w-0' },
      createElement(
        'div',
        { className: 'font-medium text-sm' },
        senderName,
        projectName
          ? createElement(
              'span',
              { className: 'font-normal text-muted-foreground ml-1' },
              `(${projectName}${threadName ? ` · ${threadName}` : ''})`,
            )
          : null,
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
      {
        className:
          'toast-actions absolute top-1 right-1 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm rounded',
      },
      createElement(
        'button',
        {
          type: 'button',
          title: 'Прочитано',
          className:
            'p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors',
          // pointerdown гасим тоже: Radix DismissableLayer (открытые модалки)
          // слушает именно pointerdown, он срабатывает раньше click → без этого
          // клик по кнопке тоста закрывал открытый диалог.
          onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
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
          onPointerDown: (e: { stopPropagation: () => void }) => e.stopPropagation(),
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
