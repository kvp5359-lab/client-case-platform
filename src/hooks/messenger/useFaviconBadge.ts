"use client"

/**
 * Динамический favicon с бейджем непрочитанных сообщений.
 *
 * Рисует жёлтый квадрат с числом через canvas и подменяет им favicon вкладки.
 * Управляет собственным <link>-тегом с id=dynamic-favicon, чтобы не конфликтовать
 * с тегами, которые генерит Next.js из src/app/favicon.ico.
 * Использует useTotalUnreadCount — тот же queryKey, что и бейдж в сайдбаре.
 *
 * MutationObserver следит за <head> и удаляет любые <link rel=icon>, которые
 * Next.js может вставить при клиентской навигации между страницами.
 */

import { useEffect } from 'react'
import { useTotalFilteredUnreadCount } from './useFilteredInbox'

const DYNAMIC_FAVICON_ID = 'dynamic-favicon'

function removeConflictingFavicons() {
  // Next.js генерит <link rel="icon" href="/favicon.ico"> — отключаем, чтобы
  // наш динамический тег гарантированно показывался вкладкой.
  const existing = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
  existing.forEach((el) => {
    if (el.id !== DYNAMIC_FAVICON_ID) el.remove()
  })
}

function ensureDynamicLink(): HTMLLinkElement {
  let link = document.getElementById(DYNAMIC_FAVICON_ID) as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.id = DYNAMIC_FAVICON_ID
    link.rel = 'icon'
    link.type = 'image/png'
    document.head.appendChild(link)
  }
  return link
}

export function useFaviconBadge(workspaceId: string | undefined) {
  const { data: totalUnread } = useTotalFilteredUnreadCount(workspaceId ?? '')

  // Следим за <head>: если Next.js вставит новый <link rel=icon> — убираем его.
  useEffect(() => {
    removeConflictingFavicons()
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLLinkElement)) continue
          if (node.id === DYNAMIC_FAVICON_ID) continue
          if (node.rel && node.rel.includes('icon')) node.remove()
        }
      }
    })
    observer.observe(document.head, { childList: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const count = totalUnread ?? 0
    const link = ensureDynamicLink()

    // Без непрочитанных — показать оригинальный favicon.ico
    if (count === 0) {
      link.type = 'image/x-icon'
      link.href = '/favicon.ico'
      return
    }
    link.type = 'image/png'

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
      const link = document.getElementById(DYNAMIC_FAVICON_ID) as HTMLLinkElement | null
      if (link) {
        link.type = 'image/x-icon'
        link.href = '/favicon.ico'
      }
    }
  }, [])
}
