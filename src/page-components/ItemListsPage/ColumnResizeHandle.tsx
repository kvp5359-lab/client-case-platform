"use client"

import { useRef, useState } from 'react'

type ColumnResizeHandleProps = {
  columnKey: string
  /** Индекс <col> внутри <colgroup> (с учётом чекбокс-колонки = 0). */
  colIndex: number
  minWidth: number
  onCommit: (key: string, width: number) => void
}

/**
 * Drag-ресайз колонки. Чтобы не лагать на каждом mousemove, во время drag
 * двигаем DOM напрямую (style.width у <col> и у <table>) — React не
 * перерисовывает строки. На mouseup однократно коммитим финальную ширину
 * в state + БД через onCommit.
 */
export function ColumnResizeHandle({ columnKey, colIndex, minWidth, onCommit }: ColumnResizeHandleProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const handleEl = ref.current
    if (!handleEl) return
    const tableEl = handleEl.closest('table') as HTMLTableElement | null
    if (!tableEl) return
    const colEl = tableEl.querySelectorAll('colgroup col')[colIndex] as HTMLTableColElement | undefined
    if (!colEl) return

    const startX = e.clientX
    const startWidth = parseFloat(colEl.style.width) || colEl.getBoundingClientRect().width
    const startTableWidth = parseFloat(tableEl.style.width) || tableEl.getBoundingClientRect().width
    let lastWidth = startWidth

    setActive(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const next = Math.max(minWidth, Math.round(startWidth + dx))
      lastWidth = next
      colEl.style.width = `${next}px`
      tableEl.style.width = `${startTableWidth + (next - startWidth)}px`
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setActive(false)
      onCommit(columnKey, lastWidth)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      ref={ref}
      onMouseDown={handleMouseDown}
      className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize z-20 hover:bg-primary/40 ${active ? 'bg-primary/60' : ''}`}
    />
  )
}
