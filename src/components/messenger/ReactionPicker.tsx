import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { SmilePlus } from 'lucide-react'
import { useState } from 'react'

// Только эмодзи, поддерживаемые Telegram Bot API для реакций
export const REACTIONS = [
  '👍',
  '❤️',
  '🔥',
  '🎉',
  '👏',
  '😁',
  '🤔',
  '🤯',
  '😱',
  '😢',
  '🙏',
  '👀',
  '💯',
  '🤣',
  '❤️‍🔥',
  '👌',
  '🏆',
  '🤩',
]

interface ReactionPickerProps {
  onPick: (emoji: string) => void
}

export function ReactionPicker({ onPick }: ReactionPickerProps) {
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6">
          <SmilePlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start" side="top">
        <div className="grid grid-cols-6 gap-1">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => {
                onPick(emoji)
                setOpen(false)
              }}
              className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted text-lg transition-colors"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
