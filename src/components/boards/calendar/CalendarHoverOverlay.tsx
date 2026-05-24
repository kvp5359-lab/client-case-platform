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
} | null

type Props = {
  hoverTime: HoverTime
  previewRect: PreviewRect
}

export function CalendarHoverOverlay({ hoverTime, previewRect }: Props) {
  if (typeof document === 'undefined') return null

  return (
    <>
      {hoverTime && !previewRect &&
        createPortal(
          <>
            <div
              className="fixed z-[9998] pointer-events-none"
              style={{
                left: hoverTime.stripeLeft,
                top: hoverTime.stripeTop,
                width: hoverTime.stripeWidth,
                height: 2,
                backgroundColor: 'hsl(var(--primary) / 0.95)',
              }}
            />
            <div
              className="fixed z-[9999] pointer-events-none text-[12px] font-medium leading-none px-1 bg-white"
              style={{
                left: hoverTime.labelLeft,
                top: hoverTime.stripeTop,
                transform: 'translate(-100%, -50%)',
                color: 'hsl(var(--primary) / 0.95)',
              }}
            >
              {hoverTime.label}
            </div>
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
