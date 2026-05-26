import { useImperativeHandle, useState, forwardRef, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'

export type BubbleLinkMenuHandle = {
  openAt: (x: number, y: number, href: string) => void
}

/**
 * Контекстное меню для ссылки внутри баббла сообщения. Открывается из
 * `BubbleTextContent` по правому клику на `<a>` через imperative-ручку.
 *
 * Намеренно НЕ Radix Popover/DropdownMenu — их DismissibleLayer ловит
 * pointer-серии от правого клика как outside-click и моментально
 * закрывает popup сразу после открытия. Используем простой absolute
 * div в портале + ручной outside-click listener на mousedown.
 */
export const BubbleLinkMenu = forwardRef<BubbleLinkMenuHandle>(function BubbleLinkMenu(
  _props,
  ref,
) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [href, setHref] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  // Игнорируем pointerup сразу после openAt — это «хвост» того же правого
  // клика, иначе он мгновенно закроет меню.
  const openedAtRef = useRef(0)

  useImperativeHandle(ref, () => ({
    openAt: (x, y, h) => {
      setPos({ x, y })
      setHref(h)
      setOpen(true)
      openedAtRef.current = Date.now()
    },
  }))

  // Закрытие по клику вне меню.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      // Тот же правый клик ещё может прислать mouseup в течение ~150мс —
      // не считаем его outside.
      if (Date.now() - openedAtRef.current < 200) return
      if (menuRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

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

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 60 }}
      className="min-w-[200px] rounded-md border bg-popover p-1 shadow-md"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={handleOpen}
        className="w-full flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent outline-none text-left"
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        Перейти по ссылке
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="w-full flex items-center px-2 py-1.5 text-sm rounded-sm hover:bg-accent outline-none text-left"
      >
        <Copy className="h-4 w-4 mr-2" />
        Копировать ссылку
      </button>
    </div>,
    document.body,
  )
})
