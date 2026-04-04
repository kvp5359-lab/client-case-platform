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

interface DeleteMessageDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  telegramMessageId?: number | null
  onConfirm: () => void
}

export function DeleteMessageDialog({
  open,
  onOpenChange,
  telegramMessageId,
  onConfirm,
}: DeleteMessageDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить сообщение?</AlertDialogTitle>
          <AlertDialogDescription>
            Сообщение будет удалено безвозвратно.
            {telegramMessageId ? ' Также будет удалено из Telegram (если не старше 48 часов).' : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Удалить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
