import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { ConfirmDialogState } from '@/hooks/dialogs/useConfirmDialog'

interface ConfirmDialogProps {
  state: ConfirmDialogState
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ state, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <AlertDialog
      open={state.isOpen}
      onOpenChange={(open) => {
        if (!open) onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state.title}</AlertDialogTitle>
          <AlertDialogDescription>{state.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{state.cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              state.variant === 'destructive'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : undefined
            }
          >
            {state.confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
