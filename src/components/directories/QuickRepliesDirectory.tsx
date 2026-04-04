/**
 * QuickRepliesDirectory — управление справочником быстрых ответов.
 * Обёртка: useQuickRepliesPage + QuickReplyTreeView + QuickReplyFormDialog.
 */

import { useQuickRepliesPage } from '@/hooks/useQuickRepliesPage'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { QuickReplyTreeView } from './QuickReplyTreeView'
import { QuickReplyFormDialog } from './QuickReplyFormDialog'

export function QuickRepliesDirectory() {
  const page = useQuickRepliesPage()

  return (
    <div>
      <QuickReplyTreeView page={page} />

      <QuickReplyFormDialog
        key={page.editingReply?.id ?? 'new'}
        open={page.replyDialogOpen}
        onOpenChange={page.setReplyDialogOpen}
        editingReply={page.editingReply}
        onSave={(data) => {
          if (page.editingReply) {
            page.updateReplyMutation.mutate(
              { id: page.editingReply.id, ...data },
              { onSuccess: () => page.setReplyDialogOpen(false) },
            )
          }
        }}
        saving={page.updateReplyMutation.isPending}
      />

      <ConfirmDialog {...page.confirmDialogProps} />
    </div>
  )
}
