"use client"

/**
 * «Угаданный» target-язык для перевода исходящих в этом треде.
 * Fallback цепочка:
 *  1. localStorage per-thread — последний явно выбранный в этом чате.
 *  2. source_language из кэша переводов входящих треда — то, на чём пишет клиент.
 *  3. localStorage глобально — последний выбранный юзером где-либо.
 *  4. 'en'.
 *
 * Сохранение: setTarget пишет и per-thread, и global.
 */

import { useCallback, useEffect, useState } from 'react'
import { useThreadTranslations } from './useThreadTranslations'
import { useMyPreferredLanguage } from '../useMyPreferredLanguage'

const STORAGE_PREFIX = 'cc:translate-target'
const GLOBAL_KEY = `${STORAGE_PREFIX}:last`

function readPerThread(threadId: string | undefined): string | null {
  if (!threadId || typeof window === 'undefined') return null
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}:${threadId}`)
  } catch {
    return null
  }
}

function readGlobal(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(GLOBAL_KEY)
  } catch {
    return null
  }
}

function writeTarget(threadId: string | undefined, lang: string) {
  if (typeof window === 'undefined') return
  try {
    if (threadId) localStorage.setItem(`${STORAGE_PREFIX}:${threadId}`, lang)
    localStorage.setItem(GLOBAL_KEY, lang)
    // Уведомим другие инстансы кнопки в этой же вкладке.
    window.dispatchEvent(
      new CustomEvent('cc:translate-target-changed', { detail: { threadId, lang } }),
    )
  } catch {
    /* quota */
  }
}

export function useThreadTargetLanguage(threadId: string | undefined) {
  // Язык клиента: source_language из любого перевода входящего этого треда.
  // Берём язык юзера, чтобы хук вернул уже отфильтрованный набор.
  const { data: preferredLang } = useMyPreferredLanguage()
  const { data: threadTranslations } = useThreadTranslations(
    threadId,
    preferredLang ?? undefined,
  )

  const sourceFromTranslations =
    threadTranslations?.find((t) => !!t.source_language)?.source_language ?? null

  const compute = useCallback((): string => {
    const perThread = readPerThread(threadId)
    if (perThread) return perThread
    if (sourceFromTranslations) return sourceFromTranslations
    const global = readGlobal()
    if (global) return global
    return 'en'
  }, [threadId, sourceFromTranslations])

  const [target, setTargetState] = useState<string>(compute)

  // Пересчитываем при смене треда или появлении кэша переводов.
  useEffect(() => {
    setTargetState(compute())
  }, [compute])

  // Слушаем изменения из других экземпляров (split-button рендерится в разных
  // местах: композер, потенциально другие места). Чтобы при выборе из меню
  // обновлялись все.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ threadId?: string; lang: string }>).detail
      // Если событие про наш тред ИЛИ про глобальный fallback — пересчитываем.
      if (!detail) return
      if (!threadId || detail.threadId === threadId || !detail.threadId) {
        setTargetState(compute())
      }
    }
    window.addEventListener('cc:translate-target-changed', onChanged)
    return () => window.removeEventListener('cc:translate-target-changed', onChanged)
  }, [threadId, compute])

  const setTarget = useCallback(
    (lang: string) => {
      writeTarget(threadId, lang)
      setTargetState(lang)
    },
    [threadId],
  )

  return { target, setTarget }
}
