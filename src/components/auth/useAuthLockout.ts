"use client"

/**
 * useAuthLockout — клиентский lockout после неудачных попыток
 * Хранит счётчик в sessionStorage, чтобы перезагрузка не сбрасывала lockout.
 * Используется в LoginForm и RegisterForm.
 */

import { useState, useEffect, useRef } from 'react'

interface UseAuthLockoutOptions {
  /** Префикс для ключей sessionStorage (например, 'login' или 'register') */
  storagePrefix: string
  /** Кол-во неудачных попыток до lockout (по умолчанию 5) */
  maxAttempts?: number
  /** Длительность lockout в секундах (по умолчанию 30) */
  lockoutDuration?: number
}

interface UseAuthLockoutReturn {
  isLocked: boolean
  remainingSeconds: number
  /** Вызвать при неудачной попытке. Возвращает true, если lockout сработал */
  recordFailedAttempt: () => boolean
  /** Сбросить счётчик (например, при успешном входе) */
  resetAttempts: () => void
}

export function useAuthLockout({
  storagePrefix,
  maxAttempts = 5,
  lockoutDuration = 30,
}: UseAuthLockoutOptions): UseAuthLockoutReturn {
  const attemptsKey = `${storagePrefix}_failed_attempts`
  const lockoutKey = `${storagePrefix}_lockout_until`

  const getStoredAttempts = () => {
    if (typeof window === 'undefined') return 0
    const val = sessionStorage.getItem(attemptsKey)
    return val ? parseInt(val, 10) : 0
  }

  const setStoredAttempts = (n: number) => {
    if (typeof window === 'undefined') return
    sessionStorage.setItem(attemptsKey, String(n))
  }

  const failedAttemptsRef = useRef(0)

  const [remainingSeconds, setRemainingSeconds] = useState(0)

  // Инициализация из sessionStorage на клиенте
  useEffect(() => {
    failedAttemptsRef.current = getStoredAttempts()
    const until = sessionStorage.getItem(lockoutKey)
    if (until) {
      const remaining = Math.ceil((parseInt(until, 10) - Date.now()) / 1000)
      if (remaining > 0) setRemainingSeconds(remaining)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (remainingSeconds <= 0) return
    const timer = setTimeout(() => setRemainingSeconds((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [remainingSeconds])

  const recordFailedAttempt = (): boolean => {
    failedAttemptsRef.current += 1
    setStoredAttempts(failedAttemptsRef.current)

    if (failedAttemptsRef.current >= maxAttempts) {
      setRemainingSeconds(lockoutDuration)
      sessionStorage.setItem(lockoutKey, String(Date.now() + lockoutDuration * 1000))
      failedAttemptsRef.current = 0
      setStoredAttempts(0)
      return true
    }
    return false
  }

  const resetAttempts = () => {
    failedAttemptsRef.current = 0
    setStoredAttempts(0)
    sessionStorage.removeItem(lockoutKey)
  }

  return {
    isLocked: remainingSeconds > 0,
    remainingSeconds,
    recordFailedAttempt,
    resetAttempts,
  }
}
