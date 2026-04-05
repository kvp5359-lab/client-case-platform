"use client"

/**
 * useTelegramLinkCopy — копирование Telegram-кода в clipboard с 2-секундным
 * фидбэком "copied". Выделено из useChatSettingsActions для уменьшения файла.
 */

import { useCallback, useState } from 'react'

export function useTelegramLinkCopy(telegramLinkCode: string | null | undefined) {
  const [telegramCopied, setTelegramCopied] = useState(false)

  const handleCopyTelegramCode = useCallback(async () => {
    if (!telegramLinkCode) return
    try {
      await navigator.clipboard.writeText(`/link ${telegramLinkCode}`)
      setTelegramCopied(true)
      setTimeout(() => setTelegramCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }, [telegramLinkCode])

  return { telegramCopied, handleCopyTelegramCode }
}
