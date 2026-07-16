"use client"

/**
 * Формат вставки ссылок (прятать под названием / нумеровать) — настройка
 * ПОЛЬЗОВАТЕЛЯ, не проекта: живёт в localStorage под его id, поэтому пикер
 * открывается с теми же тумблерами в любом проекте.
 */

import { useEffect, useState } from 'react'

export type SharePrefs = { hideUnderText: boolean; numbered: boolean }

const SHARE_PREFS_KEY = 'cc_share_link_prefs'
const FALLBACK: SharePrefs = { hideUnderText: false, numbered: false }

function readSharePrefs(userId: string | undefined): SharePrefs {
  if (typeof window === 'undefined') return FALLBACK
  try {
    const raw = window.localStorage.getItem(`${SHARE_PREFS_KEY}:${userId ?? 'anon'}`)
    if (!raw) return FALLBACK
    const p = JSON.parse(raw)
    return { hideUnderText: !!p.hideUnderText, numbered: !!p.numbered }
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
  const [hideUnderText, setHideUnderText] = useState(() => readSharePrefs(userId).hideUnderText)
  const [numbered, setNumbered] = useState(() => readSharePrefs(userId).numbered)

  useEffect(() => {
    writeSharePrefs(userId, { hideUnderText, numbered })
  }, [userId, hideUnderText, numbered])

  return { hideUnderText, setHideUnderText, numbered, setNumbered }
}
