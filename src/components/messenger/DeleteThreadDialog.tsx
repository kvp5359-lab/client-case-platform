/**
 * DeleteThreadDialog — диалог подтверждения удаления чата/треда.
 */

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
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'

interface DeleteThreadDialogProps {
  thread: ProjectThread | null
  onConfirm: () => void
  onClose: () => void
}

export function DeleteThreadDialog({ thread, onConfirm, onClose }: DeleteThreadDialogProps) {
  return (
    <AlertDialog
      open={!!thread}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить чат «{thread?.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            Все сообщения в этом чате будут удалены. Это действие нельзя отменить.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
