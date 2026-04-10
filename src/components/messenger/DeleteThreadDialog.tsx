/**
 * DeleteThreadDialog — диалог подтверждения удаления чата/задачи.
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

interface DeleteThreadDialogProps {
  thread: { name: string; type?: 'chat' | 'task' } | null
  onConfirm: () => void
  onClose: () => void
}

export function DeleteThreadDialog({ thread, onConfirm, onClose }: DeleteThreadDialogProps) {
  const isTask = thread?.type === 'task'
  const title = isTask ? `Удалить задачу «${thread?.name}»?` : `Удалить чат «${thread?.name}»?`
  const description = isTask
    ? 'Задача и все её сообщения будут удалены. Это действие нельзя отменить.'
    : 'Все сообщения в этом чате будут удалены. Это действие нельзя отменить.'

  return (
    <AlertDialog
      open={!!thread}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
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
