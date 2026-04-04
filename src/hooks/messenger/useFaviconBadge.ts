"use client"

/**
 * Динамический favicon с бейджем непрочитанных сообщений.
 *
 * Рисует красный кружок с числом поверх SVG-favicon через canvas.
 * Использует useTotalUnreadCount — тот же queryKey, что и бейдж в сайдбаре.
 */

import { useEffect, useRef } from 'react'
import { useTotalFilteredUnreadCount } from './useFilteredInbox'

const ORIGINAL_FAVICON = '/favicon.svg'

export function useFaviconBadge(workspaceId: string | undefined) {
  const { data: totalUnread } = useTotalFilteredUnreadCount(workspaceId ?? '')
  const linkRef = useRef<HTMLLinkElement | null>(null)
  const prevCountRef = useRef<number>(0)

  useEffect(() => {
    const count = totalUnread ?? 0

    // Не перерисовывать, если число не изменилось
    if (count === prevCountRef.current) return
    prevCountRef.current = count

    const link =
      linkRef.current ?? (document.querySelector('link[rel="icon"]') as HTMLLinkElement | null)
    if (!link) return
    linkRef.current = link

    // Без непрочитанных — вернуть оригинальный favicon
    if (count === 0) {
      link.href = ORIGINAL_FAVICON
      return
    }

    // Жёлтый квадрат с числом — полностью заменяет favicon
    const size = 64
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Жёлтый фон со скруглёнными углами (как у оригинального favicon)
    const radius = 12
    ctx.beginPath()
    ctx.moveTo(radius, 0)
    ctx.lineTo(size - radius, 0)
    ctx.quadraticCurveTo(size, 0, size, radius)
    ctx.lineTo(size, size - radius)
    ctx.quadraticCurveTo(size, size, size - radius, size)
    ctx.lineTo(radius, size)
    ctx.quadraticCurveTo(0, size, 0, size - radius)
    ctx.lineTo(0, radius)
    ctx.quadraticCurveTo(0, 0, radius, 0)
    ctx.closePath()
    ctx.fillStyle = '#f59e0b'
    ctx.fill()

    // Число по центру
    const label = count > 99 ? '99+' : String(count)
    const fontSize = label.length > 2 ? 35 : 41
    ctx.font = `bold ${fontSize}px system-ui, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label, size / 2, size / 2 + 1)

    link.href = canvas.toDataURL('image/png')
  }, [totalUnread])

  // Восстановить оригинальный favicon при размонтировании
  useEffect(() => {
    return () => {
      const link = linkRef.current
      if (link) link.href = ORIGINAL_FAVICON
    }
  }, [])
}
