"use client"

/**
 * Портал-оверлей: плавающая полоска со временем под курсором (hover) и
 * «призрак» блока при drag из board-списков (preview).
 */

import { createPortal } from 'react-dom'
import { ACCENT_HEX } from './accentColors'
import type { PreviewRect } from './useCalendarDropMonitor'

export type HoverTime = {
  stripeLeft: number
  stripeTop: number
  stripeWidth: number
  labelLeft: number
  label: string
  labelBg: string
} | null

type Props = {
  hoverTime: HoverTime
  previewRect: PreviewRect
}

// Левый край открытой боковой панели (.side-panel, docked right). Полоса
// hover'а портится в body с очень высоким z-index и иначе рисуется ПОВЕРХ
// панели, когда колонка дня уходит под неё. Обрезаем полосу по этому краю.
function getOpenSidePanelLeft(): number {
  if (typeof document === 'undefined') return Infinity
  let left = Infinity
  document.querySelectorAll('.side-panel').forEach((el) => {
    const rect = (el as HTMLElement).getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) left = Math.min(left, rect.left)
  })
  return left
}

export function CalendarHoverOverlay({ hoverTime, previewRect }: Props) {
  if (typeof document === 'undefined') return null

  const panelLeft = hoverTime ? getOpenSidePanelLeft() : Infinity
  const stripeRight = hoverTime
    ? Math.min(hoverTime.stripeLeft + hoverTime.stripeWidth, panelLeft)
    : 0
  const clippedWidth = hoverTime ? stripeRight - hoverTime.stripeLeft : 0

  return (
    <>
      {hoverTime && !previewRect && clippedWidth > 0 &&
        createPortal(
          <>
            <div
              className="fixed z-[9998] pointer-events-none"
              style={{
                left: hoverTime.stripeLeft,
                top: hoverTime.stripeTop,
                width: clippedWidth,
                height: 2,
                backgroundColor: 'hsl(var(--primary) / 0.95)',
              }}
            />
            {hoverTime.labelLeft <= panelLeft && (
              <div
                className="fixed z-[9999] pointer-events-none text-[12px] font-medium leading-none px-1"
                style={{
                  left: hoverTime.labelLeft,
                  top: hoverTime.stripeTop,
                  transform: 'translate(-100%, calc(-50% - 1px))',
                  color: 'hsl(var(--primary) / 0.95)',
                  // Фон колонки под курсором (голубой для текущего дня, белый
                  // для прочих) — чтобы подпись сливалась с подложкой.
                  backgroundColor: hoverTime.labelBg,
                }}
              >
                {hoverTime.label}
              </div>
            )}
          </>,
          document.body,
        )}
      {previewRect &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none rounded text-white text-xs px-1.5 py-0.5 opacity-80"
            style={{
              left: previewRect.left,
              top: previewRect.top,
              width: previewRect.width,
              height: previewRect.height,
              backgroundColor: ACCENT_HEX[previewRect.accent] ?? ACCENT_HEX.blue,
              boxShadow: '0 0 0 1px white inset',
            }}
          >
            <div className="font-medium truncate">{previewRect.title}</div>
            <div className="opacity-85">{previewRect.startLabel}</div>
          </div>,
          document.body,
        )}
    </>
  )
}
