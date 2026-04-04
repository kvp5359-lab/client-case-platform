import { cn } from '@/lib/utils'
import { Send, Mail, Unplug } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface TelegramLinkStatusProps {
  isLinked: boolean
  chatTitle: string | null
  onClick: () => void
  /** В будущем: 'email' для почтового канала */
  channelType?: 'telegram' | 'email'
}

export function TelegramLinkStatus({
  isLinked,
  chatTitle,
  onClick,
  channelType = 'telegram',
}: TelegramLinkStatusProps) {
  if (channelType === 'email') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClick}
              className="flex items-center justify-center h-7 w-7 rounded-full transition-colors text-red-500 hover:bg-red-50"
            >
              <Mail className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Email подключён</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onClick}
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-full transition-colors',
              isLinked
                ? 'text-[#2AABEE] hover:bg-sky-50'
                : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted',
            )}
          >
            {isLinked ? <Send className="h-4 w-4" /> : <Unplug className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {isLinked ? `Telegram: ${chatTitle || 'Группа привязана'}` : 'Подключить канал доставки'}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
