/**
 * Floating button to mark chat as read or unread
 */

import { CheckCheck, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type ReadUnreadButtonProps = {
  showUnread: boolean
  onMarkRead: () => void
  onMarkUnread: () => void
  isMarkReadPending: boolean
  isMarkUnreadPending: boolean
  /** Тон кнопки «Прочитано»: 'red' (обычный) / 'slate' (заглушённый тред). */
  tone?: 'red' | 'slate'
}

export function ReadUnreadButton({
  showUnread,
  onMarkRead,
  onMarkUnread,
  isMarkReadPending,
  isMarkUnreadPending,
  tone = 'red',
}: ReadUnreadButtonProps) {
  if (showUnread) {
    return (
      <button
        type="button"
        className={cn(
          'pointer-events-auto h-6 px-3 text-xs gap-1 inline-flex items-center rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.55)] transition-colors disabled:opacity-50',
          tone === 'slate'
            ? 'border border-slate-300 text-slate-600 hover:bg-slate-50'
            : 'border border-red-300 text-red-600 hover:bg-red-50',
        )}
        onClick={onMarkRead}
        disabled={isMarkReadPending}
      >
        <CheckCheck className="h-3.5 w-3.5" />
        Прочитано
      </button>
    )
  }

  return (
    <button
      type="button"
      className="pointer-events-auto h-6 px-3 text-xs gap-1 inline-flex items-center rounded-full bg-white border border-gray-200 shadow-[0_0_8px_2px_rgba(255,255,255,0.55)] text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors disabled:opacity-50"
      onClick={onMarkUnread}
      disabled={isMarkUnreadPending}
    >
      <EyeOff className="h-3.5 w-3.5" />
      Непрочитано
    </button>
  )
}
