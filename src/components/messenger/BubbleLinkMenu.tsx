import { useImperativeHandle, useState, forwardRef } from 'react'
import { ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

export type BubbleLinkMenuHandle = {
  openAt: (x: number, y: number, href: string) => void
}

/**
 * Контекстное меню для ссылки внутри баббла сообщения. Открывается из
 * `BubbleTextContent` по правому клику на `<a>` через imperative-ручку.
 * Anchor — невидимый 1x1px span, позиционированный по координатам клика
 * через position:fixed. Radix Popover берёт его как точку привязки.
 */
export const BubbleLinkMenu = forwardRef<BubbleLinkMenuHandle>(function BubbleLinkMenu(
  _props,
  ref,
) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [href, setHref] = useState('')

  useImperativeHandle(ref, () => ({
    openAt: (x, y, h) => {
      setPos({ x, y })
      setHref(h)
      setOpen(true)
    },
  }))

  const handleOpen = () => {
    window.open(href, '_blank', 'noopener,noreferrer')
    setOpen(false)
  }

  const handleCopy = () => {
    navigator.clipboard
      .writeText(href)
      .then(() => toast.success('Ссылка скопирована'))
      .catch(() => toast.error('Не удалось скопировать'))
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{
            position: 'fixed',
            left: pos.x,
            top: pos.y,
            width: 1,
            height: 1,
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={2}
        className="w-52 p-1"
      >
        <button
          type="button"
          onClick={handleOpen}
          className="w-full flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent focus:bg-accent outline-none"
        >
          <ExternalLink className="h-4 w-4 mr-2" />
          Перейти по ссылке
        </button>
        <button
          type="button"
          onClick={handleCopy}
          className="w-full flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent focus:bg-accent outline-none"
        >
          <Copy className="h-4 w-4 mr-2" />
          Копировать ссылку
        </button>
      </PopoverContent>
    </Popover>
  )
})
