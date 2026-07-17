"use client"

/**
 * Формат вставки ссылок (прятать под названием / нумеровать / что делать с
 * загруженными документами) — настройка ПОЛЬЗОВАТЕЛЯ, не проекта: живёт в
 * localStorage под его id, поэтому пикер открывается с теми же тумблерами в
 * любом проекте.
 */

import { useEffect, useState } from 'react'
import type { UploadedDisplay } from '@/lib/share/docTreeInsert'

export type SharePrefs = {
  hideUnderText: boolean
  numbered: boolean
  uploadedDisplay: UploadedDisplay
}

const SHARE_PREFS_KEY = 'cc_share_link_prefs'
const FALLBACK: SharePrefs = { hideUnderText: false, numbered: false, uploadedDisplay: 'keep' }
const UPLOADED_DISPLAY_VALUES: UploadedDisplay[] = ['keep', 'strike', 'hide']

function readSharePrefs(userId: string | undefined): SharePrefs {
  if (typeof window === 'undefined') return FALLBACK
  try {
    const raw = window.localStorage.getItem(`${SHARE_PREFS_KEY}:${userId ?? 'anon'}`)
    if (!raw) return FALLBACK
    const p = JSON.parse(raw)
    return {
      hideUnderText: !!p.hideUnderText,
      numbered: !!p.numbered,
      uploadedDisplay: UPLOADED_DISPLAY_VALUES.includes(p.uploadedDisplay)
        ? p.uploadedDisplay
        : 'keep',
    }
  } catch {
    return FALLBACK
  }
}

function writeSharePrefs(userId: string | undefined, prefs: SharePrefs) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${SHARE_PREFS_KEY}:${userId ?? 'anon'}`, JSON.stringify(prefs))
  } catch {
    /* localStorage недоступен — игнорируем */
  }
}

export function useSharePrefs(userId: string | undefined) {
  const [prefs, setPrefs] = useState<SharePrefs>(() => readSharePrefs(userId))

  useEffect(() => {
    writeSharePrefs(userId, prefs)
  }, [userId, prefs])

  return {
    ...prefs,
    setHideUnderText: (v: boolean) => setPrefs((p) => ({ ...p, hideUnderText: v })),
    setNumbered: (v: boolean) => setPrefs((p) => ({ ...p, numbered: v })),
    setUploadedDisplay: (v: UploadedDisplay) => setPrefs((p) => ({ ...p, uploadedDisplay: v })),
  }
}
