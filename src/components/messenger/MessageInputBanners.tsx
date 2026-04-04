import { Button } from '@/components/ui/button'
import { X, Pencil } from 'lucide-react'
import type { ProjectMessage } from '@/services/api/messengerService'
import { stripHtml } from '@/utils/messengerHtml'

interface EditingBannerProps {
  editingMessage: ProjectMessage
  onClearEdit: () => void
}

export function EditingBanner({ editingMessage, onClearEdit }: EditingBannerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50/50 dark:bg-amber-950/20 border-b">
      <Pencil className="h-3.5 w-3.5 text-amber-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Редактирование</p>
        <p className="text-xs text-muted-foreground line-clamp-1">
          {stripHtml(editingMessage.content)}
        </p>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClearEdit}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

interface ReplyBannerProps {
  replyTo: ProjectMessage
  onClearReply: () => void
}

export function ReplyBanner({ replyTo, onClearReply }: ReplyBannerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground">{replyTo.sender_name}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{stripHtml(replyTo.content)}</p>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClearReply}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
