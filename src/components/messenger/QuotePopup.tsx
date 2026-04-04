import { Quote } from 'lucide-react'

interface QuotePopupProps {
  x: number
  y: number
  text: string
  onQuote: (text: string) => void
}

export function QuotePopup({ x, y, text, onQuote }: QuotePopupProps) {
  return (
    <div
      className="absolute z-20 -translate-x-1/2 -translate-y-full"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 bg-popover text-popover-foreground border shadow-md rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
        onClick={() => {
          onQuote(text)
          window.getSelection()?.removeAllRanges()
        }}
      >
        <Quote className="h-3 w-3" />
        Цитировать
      </button>
    </div>
  )
}
