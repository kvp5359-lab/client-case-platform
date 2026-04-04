/**
 * Базовые типы для диалоговых компонентов
 */

/**
 * Базовые props, общие для всех диалогов приложения.
 *
 * Использование:
 * ```tsx
 * interface MyDialogProps extends DialogBaseProps {
 *   title: string
 *   onSave: () => void
 * }
 * ```
 */
export interface DialogBaseProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
