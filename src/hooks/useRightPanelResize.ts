"use client"

import { useState, useRef, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'cc:right-panel-width'
const DEFAULT_WIDTH = 600
const MIN_RATIO = 0.30
const MAX_RATIO = 0.80

function clampWidth(width: number) {
  if (typeof window === 'undefined') return width
  const min = window.innerWidth * MIN_RATIO
  const max = window.innerWidth * MAX_RATIO
  return Math.max(min, Math.min(max, width))
}

/**
 * Ресайз правой панели мышью.
 *
 * Во время перетаскивания обновляется только CSS-переменная `--panel-width`
 * через DOM — без setState, чтобы не триггерить ре-рендеры всего WorkspaceLayout
 * на каждый mousemove (это давало лаги). React-стейт обновляется один раз
 * на pointerup и сохраняется в localStorage.
 *
 * Используются Pointer Events с setPointerCapture — это гарантирует доставку
 * pointermove/pointerup на handle, даже если курсор ушёл за его границы или
 * наехал на элемент с большим z-index (раньше mouseup иногда «прилипал»).
 */
export function useRightPanelResize() {
  const [panelWidth, setPanelWidth] = useState(DEFAULT_WIDTH)
  const widthRef = useRef(panelWidth)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const w = parseInt(saved, 10)
        if (!Number.isNaN(w)) {
          const clamped = clampWidth(w)
          // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage недоступен на сервере; читаем после mount чтобы избежать SSR/CSR-mismatch
          setPanelWidth(clamped)
          widthRef.current = clamped
          document.documentElement.style.setProperty('--panel-width', `${clamped}px`)
        }
      }
    } catch {
      /* ignore */
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const target = e.currentTarget
    const pointerId = e.pointerId
    try {
      target.setPointerCapture(pointerId)
    } catch {
      /* ignore */
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const handleMove = (ev: PointerEvent) => {
      const newWidth = window.innerWidth - ev.clientX
      const clamped = clampWidth(newWidth)
      widthRef.current = clamped
      document.documentElement.style.setProperty('--panel-width', `${clamped}px`)
    }

    const cleanup = () => {
      target.removeEventListener('pointermove', handleMove)
      target.removeEventListener('pointerup', cleanup)
      target.removeEventListener('pointercancel', cleanup)
      try {
        target.releasePointerCapture(pointerId)
      } catch {
        /* ignore */
      }
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      try {
        localStorage.setItem(STORAGE_KEY, widthRef.current.toString())
      } catch {
        /* ignore */
      }
      setPanelWidth(widthRef.current)
    }

    target.addEventListener('pointermove', handleMove)
    target.addEventListener('pointerup', cleanup)
    target.addEventListener('pointercancel', cleanup)
  }, [])

  return { panelWidth, handlePointerDown }
}
