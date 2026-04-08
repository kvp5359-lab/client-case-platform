import { useMemo } from 'react'
import { Mail } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { ProjectMessage } from '@/services/api/messenger/messengerService'
import { formatTime } from './bubbleUtils'
import { sanitizeHtml } from '@/utils/format/sanitizeHtml'

interface EmailFullViewDialogProps {
  message: ProjectMessage | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EmailFullViewDialog({ message, open, onOpenChange }: EmailFullViewDialogProps) {
  const meta = message?.email_metadata

  const safeHtml = useMemo(
    () => (meta?.body_html ? sanitizeHtml(meta.body_html) : ''),
    [meta?.body_html],
  )

  if (!message || !meta) return null

  const date = new Date(message.created_at)
  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  const timeStr = formatTime(message.created_at)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-4 border-b space-y-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-red-500 shrink-0" />
            <span className="truncate">{meta.subject || 'Без темы'}</span>
          </DialogTitle>

          <div className="space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-2">
              <span className="text-muted-foreground/60 w-10 shrink-0">От:</span>
              <span className="font-medium text-foreground">{meta.from_email}</span>
            </div>
            {meta.to_emails?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/60 w-10 shrink-0">Кому:</span>
                <span>{meta.to_emails.join(', ')}</span>
              </div>
            )}
            {meta.cc_emails?.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground/60 w-10 shrink-0">Копия:</span>
                <span>{meta.cc_emails.join(', ')}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground/60 w-10 shrink-0">Дата:</span>
              <span>{dateStr}, {timeStr}</span>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <div
            className="email-body prose prose-sm max-w-none break-words [&_img]:max-w-full [&_img]:h-auto [&_a]:text-blue-600 [&_blockquote]:border-l-3 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
