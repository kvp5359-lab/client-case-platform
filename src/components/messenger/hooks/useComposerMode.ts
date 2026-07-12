import { useCallback, useState } from 'react'
import type { ComposerMode } from '../ComposerVisibilitySwitch'

const COMPOSER_MODES: ComposerMode[] = ['client', 'team', 'note', 'self']

function readStoredComposerMode(key: string | null): ComposerMode | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(key)
    return v && (COMPOSER_MODES as string[]).includes(v) ? (v as ComposerMode) : null
  } catch {
    return null
  }
}

/**
 * Режим видимости композера (Клиенту/Команде/Заметка/Только я) с сохранением
 * per-user-per-thread в localStorage; в памяти держим выбор текущей сессии.
 * Вынесено из MessengerTabContent (аудит 2026-07-13).
 */
export function useComposerMode(
  threadId: string,
  userId: string | undefined,
): { composerMode: ComposerMode; setComposerMode: (m: ComposerMode) => void } {
  const modeStorageKey = userId ? `cc:composer-mode:${userId}:${threadId}` : null
  const [modeByThread, setModeByThread] = useState<Record<string, ComposerMode>>({})
  const composerMode: ComposerMode =
    modeByThread[threadId] ?? readStoredComposerMode(modeStorageKey) ?? 'client'
  const setComposerMode = useCallback(
    (m: ComposerMode) => {
      setModeByThread((prev) => ({ ...prev, [threadId]: m }))
      if (modeStorageKey) {
        try {
          localStorage.setItem(modeStorageKey, m)
        } catch {
          /* quota */
        }
      }
    },
    [threadId, modeStorageKey],
  )
  return { composerMode, setComposerMode }
}
