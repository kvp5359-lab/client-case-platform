"use client"

import { useState, useCallback, useRef, useEffect } from 'react'

export interface ConfirmDialogOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'destructive'
}

export interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean
}

export interface UseConfirmDialogReturn {
  state: ConfirmDialogState
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>
  handleConfirm: () => void
  handleCancel: () => void
}

/**
 * Универсальный хук для подтверждения действий.
 * Заменяет window.confirm() на кастомный AlertDialog.
 *
 * @example
 * ```tsx
 * const { state, confirm, handleConfirm, handleCancel } = useConfirmDialog()
 *
 * const handleDelete = async () => {
 *   const ok = await confirm({
 *     title: 'Удалить документ?',
 *     description: 'Это действие нельзя отменить.',
 *     variant: 'destructive',
 *   })
 *   if (!ok) return
 *   await deleteDocument(id)
 * }
 *
 * return (
 *   <>
 *     <Button onClick={handleDelete}>Удалить</Button>
 *     <ConfirmDialog state={state} onConfirm={handleConfirm} onCancel={handleCancel} />
 *   </>
 * )
 * ```
 */
export function useConfirmDialog(): UseConfirmDialogReturn {
  const [state, setState] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Подтвердить',
    cancelText: 'Отмена',
    variant: 'default',
  })

  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  // Resolve pending promise on unmount to prevent memory leak
  useEffect(() => {
    return () => {
      if (resolveRef.current) {
        resolveRef.current(false)
        resolveRef.current = null
      }
    }
  }, [])

  const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
      setState({
        isOpen: true,
        title: options.title,
        description: options.description,
        confirmText: options.confirmText ?? 'Подтвердить',
        cancelText: options.cancelText ?? 'Отмена',
        variant: options.variant ?? 'default',
      })
    })
  }, [])

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }))
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }))
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  return { state, confirm, handleConfirm, handleCancel }
}
