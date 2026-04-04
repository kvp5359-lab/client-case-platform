"use client"

/**
 * Универсальный хук для управления состоянием диалоговых окон
 *
 * Использование:
 * ```tsx
 * const dialog = useDialog()
 *
 * <Button onClick={dialog.open}>Открыть</Button>
 * <Dialog open={dialog.isOpen} onClose={dialog.close}>
 *   ...
 * </Dialog>
 * ```
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export interface UseDialogReturn {
  /** Открыт ли диалог */
  isOpen: boolean
  /** Открыть диалог */
  open: () => void
  /** Закрыть диалог */
  close: () => void
  /** Переключить состояние диалога */
  toggle: () => void
}

export function useDialog(defaultOpen = false): UseDialogReturn {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const open = useCallback(() => {
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
  }, [])

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev)
  }, [])

  return {
    isOpen,
    open,
    close,
    toggle,
  }
}

/**
 * Хук для управления диалогом с данными
 * Полезен когда нужно передавать данные в диалог
 *
 * Использование:
 * ```tsx
 * const dialog = useDialogWithData<User>()
 *
 * <Button onClick={() => dialog.open(user)}>Редактировать</Button>
 * <EditUserDialog
 *   open={dialog.isOpen}
 *   onClose={dialog.close}
 *   user={dialog.data}
 * />
 * ```
 */
export interface UseDialogWithDataReturn<T> extends Omit<UseDialogReturn, 'open'> {
  /** Данные переданные в диалог */
  data: T | null
  /** Открыть диалог с данными */
  open: (data: T) => void
  /** Закрыть диалог и очистить данные */
  close: () => void
}

export function useDialogWithData<T = unknown>(
  defaultOpen = false,
  defaultData: T | null = null,
): UseDialogWithDataReturn<T> {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  const [data, setData] = useState<T | null>(defaultData)
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup таймера при unmount (Z7-07)
  useEffect(() => {
    return () => {
      if (clearTimerRef.current !== null) {
        clearTimeout(clearTimerRef.current)
      }
    }
  }, [])

  const open = useCallback((newData: T) => {
    // Отменяем отложенную очистку данных от предыдущего close,
    // чтобы при быстром переоткрытии новые данные не были затёрты
    if (clearTimerRef.current !== null) {
      clearTimeout(clearTimerRef.current)
      clearTimerRef.current = null
    }
    setData(newData)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    // Очищаем данные с задержкой, чтобы диалог успел закрыться с анимацией.
    // Таймер сохраняется в ref и отменяется при повторном open.
    clearTimerRef.current = setTimeout(() => {
      setData(null)
      clearTimerRef.current = null
    }, 300)
  }, [])

  // Используем функциональное обновление вместо замыкания на isOpen (Z7-08)
  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        // Закрываем — запускаем отложенную очистку данных
        clearTimerRef.current = setTimeout(() => {
          setData(null)
          clearTimerRef.current = null
        }, 300)
      }
      return !prev
    })
  }, [])

  return {
    isOpen,
    data,
    open,
    close,
    toggle,
  }
}
