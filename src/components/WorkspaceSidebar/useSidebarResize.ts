"use client"

import { useState, useRef, useEffect } from 'react'

export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth')
    return saved ? parseInt(saved, 10) : 280
  })

  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const widthRef = useRef(sidebarWidth)
  // Смещение курсора от правого края сайдбара в момент нажатия —
  // чтобы при перетаскивании граница не "скакала" к позиции курсора,
  // а двигалась относительно этой исходной точки.
  const pointerOffsetRef = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    // Вычисляем смещение курсора относительно правого края сайдбара.
    // sidebarRef указывает на <aside>, его getBoundingClientRect().right
    // даёт абсолютную координату правого края в viewport — от неё и считаем.
    const sidebarEl = sidebarRef.current
    if (sidebarEl) {
      const rect = sidebarEl.getBoundingClientRect()
      pointerOffsetRef.current = e.clientX - rect.right
    } else {
      pointerOffsetRef.current = 0
    }
    setIsResizing(true)
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return

      const sidebarEl = sidebarRef.current
      if (!sidebarEl) return

      // Ширина = позиция курсора относительно левого края сайдбара,
      // минус начальное смещение внутри handle (чтобы не было скачка).
      const rect = sidebarEl.getBoundingClientRect()
      const newWidth = e.clientX - rect.left - pointerOffsetRef.current
      const clamped = Math.max(200, Math.min(480, newWidth))
      widthRef.current = clamped
      setSidebarWidth(clamped)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      // Сохраняем в localStorage только при завершении resize
      localStorage.setItem('sidebarWidth', widthRef.current.toString())
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return { sidebarWidth, isResizing, sidebarRef, handleMouseDown }
}
