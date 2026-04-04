/**
 * Floating button to mark chat as read or unread
 */

import { CheckCheck, EyeOff } from 'lucide-react'

interface ReadUnreadButtonProps {
  showUnread: boolean
  onMarkRead: () => void
  onMarkUnread: () => void
  isMarkReadPending: boolean
  isMarkUnreadPending: boolean
}

export function ReadUnreadButton({
  showUnread,
  onMarkRead,
  onMarkUnread,
  isMarkReadPending,
  isMarkUnreadPending,
}: ReadUnreadButtonProps) {
  if (showUnread) {
    return (
      <button
        type="button"
        className="pointer-events-auto h-7 px-3 text-xs gap-1 inline-flex items-center rounded-full bg-white/80 backdrop-blur-sm border border-blue-200 shadow-sm text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50"
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
      className="pointer-events-auto h-7 px-3 text-xs gap-1 inline-flex items-center rounded-full bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm text-muted-foreground hover:text-foreground hover:bg-gray-50 transition-colors disabled:opacity-50"
      onClick={onMarkUnread}
      disabled={isMarkUnreadPending}
    >
      <EyeOff className="h-3.5 w-3.5" />
      Непрочитано
    </button>
  )
}
