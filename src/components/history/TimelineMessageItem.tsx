/**
 * Сообщение в timeline — compact bubble style (matching messenger look)
 */

import { Paperclip, Send, Mail, Forward } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TimelineMessage } from '@/types/history'

interface TimelineMessageItemProps {
  message: TimelineMessage
  isOwn: boolean
}

const BUBBLE_INCOMING: Record<string, string> = {
  blue: 'bg-blue-50',
  slate: 'bg-stone-100',
  emerald: 'bg-emerald-50',
  amber: 'bg-amber-50',
  rose: 'bg-red-50',
  violet: 'bg-violet-50',
  orange: 'bg-orange-50',
  cyan: 'bg-cyan-50',
  pink: 'bg-pink-50',
  indigo: 'bg-indigo-50',
}

const BUBBLE_OWN: Record<string, string> = {
  blue: 'bg-blue-500 text-white',
  slate: 'bg-stone-600 text-white',
  emerald: 'bg-emerald-600 text-white',
  amber: 'bg-amber-500 text-white',
  rose: 'bg-red-500 text-white',
  violet: 'bg-violet-600 text-white',
  orange: 'bg-orange-500 text-white',
  cyan: 'bg-cyan-600 text-white',
  pink: 'bg-pink-500 text-white',
  indigo: 'bg-indigo-600 text-white',
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function stripHtml(html: string): string {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent ?? div.innerText ?? ''
}

export function TimelineMessageItem({ message, isOwn }: TimelineMessageItemProps) {
  const bg = isOwn
    ? (BUBBLE_OWN[message.thread_accent] ?? 'bg-blue-500 text-white')
    : (BUBBLE_INCOMING[message.thread_accent] ?? 'bg-muted')
  const plainText = stripHtml(message.content)
  const truncated = plainText.length > 200 ? plainText.slice(0, 200) + '…' : plainText

  return (
    <div className={cn('flex items-start gap-3 px-4 py-1.5', isOwn && 'justify-end')}>
      {/* Avatar — only for incoming */}
      {!isOwn && (
        <div className="shrink-0 mt-0.5">
          {message.sender_avatar_url ? (
            <img
              src={message.sender_avatar_url}
              alt={message.sender_name}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
              {message.sender_name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      )}

      {/* Bubble */}
      <div
        className={cn(
          'max-w-[75%] min-w-0 rounded-xl px-3 py-2',
          bg,
          isOwn && 'rounded-tr-md',
          !isOwn && 'rounded-tl-md',
        )}
      >
        {/* Sender name + source (incoming only) */}
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-medium">{message.sender_name}</span>
            {message.source === 'telegram' && <Send className="w-3 h-3 text-[#2AABEE]" />}
            {message.source === 'email' && <Mail className="w-3 h-3 text-muted-foreground" />}
          </div>
        )}

        {/* Forwarded from */}
        {message.forwarded_from_name && (
          <div
            className={cn(
              'flex items-center gap-1 mb-1 text-xs italic',
              isOwn ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            <Forward className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Переслано от {message.forwarded_from_name}</span>
          </div>
        )}

        {/* Reply quote */}
        {message.reply_to && (
          <div
            className={cn(
              'border-l-2 pl-2 mb-1.5 text-xs opacity-75',
              isOwn ? 'border-white/50' : 'border-foreground/30',
            )}
          >
            <span className="font-medium">{message.reply_to.sender_name}</span>
            <p className="line-clamp-1">{stripHtml(message.reply_to.content)}</p>
          </div>
        )}

        {/* Text + inline time */}
        <div className="flex items-end gap-2">
          <p
            className={cn(
              'text-sm leading-snug break-words min-w-0 flex-1',
              isOwn ? 'text-white/90' : 'text-foreground/90',
            )}
          >
            {truncated}
          </p>
          <span
            className={cn(
              'text-[10px] leading-none flex-shrink-0 mb-[3px]',
              isOwn ? 'text-white/50' : 'text-muted-foreground',
            )}
          >
            {formatTime(message.created_at)}
          </span>
        </div>

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div
            className={cn(
              'flex items-center gap-1 mt-1 text-xs',
              isOwn ? 'text-white/60' : 'text-muted-foreground',
            )}
          >
            <Paperclip className="w-3 h-3" />
            <span>
              {message.attachments.length === 1
                ? message.attachments[0].file_name
                : `${message.attachments.length} файлов`}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
