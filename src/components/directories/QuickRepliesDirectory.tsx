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

  const isCreating = page.replyDialogOpen && !page.editingReply
  const saving = isCreating
    ? page.createReplyMutation.isPending
    : page.updateReplyMutation.isPending

  return (
    <div>
      <QuickReplyTreeView page={page} />

      <QuickReplyFormDialog
        key={page.editingReply?.id ?? (page.replyDialogOpen ? 'new' : 'closed')}
        open={page.replyDialogOpen}
        onOpenChange={page.setReplyDialogOpen}
        editingReply={page.editingReply}
        groups={page.groups}
        initialGroupId={page.creatingInGroupId}
        onSave={({ name, content, groupId }) => {
          if (page.editingReply) {
            page.updateReplyMutation.mutate(
              { id: page.editingReply.id, name, content, groupId },
              { onSuccess: () => page.setReplyDialogOpen(false) },
            )
          } else {
            page.createReplyMutation.mutate(
              { name, content, groupId: groupId ?? undefined },
              { onSuccess: () => page.setReplyDialogOpen(false) },
            )
          }
        }}
        saving={saving}
      />

      <ConfirmDialog {...page.confirmDialogProps} />
    </div>
  )
}
