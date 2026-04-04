"use client"

import { memo, useState } from 'react'
import { type Editor } from '@tiptap/react'
import { Link, Unlink } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'

interface LinkPopoverProps {
  editor: Editor
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Popup для вставки/удаления ссылок
 */
export const LinkPopover = memo(function LinkPopover({
  editor,
  open,
  onOpenChange,
}: LinkPopoverProps) {
  const isLinkActive = editor.isActive('link')
  const currentHref = isLinkActive ? ((editor.getAttributes('link').href as string) ?? '') : ''
  const [linkUrl, setLinkUrl] = useState('')

  // При открытии попапа — подставить текущий URL если курсор на ссылке
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setLinkUrl(currentHref)
    }
    onOpenChange(nextOpen)
  }

  const setLink = () => {
    if (linkUrl) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run()
    }
    setLinkUrl('')
    onOpenChange(false)
  }

  const removeLink = () => {
    editor.chain().focus().unsetLink().run()
  }

  return (
    <>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Toggle size="sm" pressed={isLinkActive}>
            <Link className="h-4 w-4" />
          </Toggle>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-2">
            <p className="text-sm font-medium">Вставить ссылку</p>
            <div className="flex gap-2">
              <Input
                placeholder="https://example.com"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setLink()
                  }
                }}
              />
              <Button size="sm" onClick={setLink}>
                Добавить
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {isLinkActive && (
        <Toggle
          size="sm"
          pressed={false}
          onMouseDown={(e) => {
            e.preventDefault()
            removeLink()
          }}
        >
          <Unlink className="h-4 w-4" />
        </Toggle>
      )}
    </>
  )
})
