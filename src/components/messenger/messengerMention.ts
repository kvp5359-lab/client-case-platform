/**
 * @-упоминания в композере (Tiptap Mention + suggestion).
 * Попап участников строится на чистом DOM (без tippy/доп. зависимостей).
 * Выбор вставляет mention-узел { id: participant_id, label }.
 */
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { Editor } from '@tiptap/core'

export type MentionItem = { id: string; label: string }

/** Извлекает participant_id всех @-упоминаний из текущего документа редактора. */
export function extractMentionIds(editor: Editor): string[] {
  const ids = new Set<string>()
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'mention' && typeof node.attrs.id === 'string') {
      ids.add(node.attrs.id)
    }
  })
  return [...ids]
}

export function buildMentionExtension(getItems: () => MentionItem[]) {
  return Mention.configure({
    HTMLAttributes: {
      class: 'mention rounded px-1 py-0.5 font-medium bg-blue-100 text-blue-800',
    },
    suggestion: {
      char: '@',
      items: ({ query }: { query: string }): MentionItem[] => {
        const q = query.trim().toLowerCase()
        return getItems()
          .filter((i) => !q || i.label.toLowerCase().includes(q))
          .slice(0, 8)
      },
      render: () => {
        let popup: HTMLDivElement | null = null
        let items: MentionItem[] = []
        let selected = 0
        let command: (item: MentionItem) => void = () => {}

        const paint = () => {
          if (!popup) return
          popup.innerHTML = ''
          if (items.length === 0) {
            const empty = document.createElement('div')
            empty.className = 'px-3 py-1.5 text-xs text-muted-foreground'
            empty.textContent = 'Никого не найдено'
            popup.appendChild(empty)
            return
          }
          items.forEach((item, i) => {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className =
              'flex w-full items-center px-3 py-1.5 text-sm text-left ' +
              (i === selected ? 'bg-accent' : 'hover:bg-muted/50')
            btn.textContent = item.label
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault()
              command(item)
            })
            popup!.appendChild(btn)
          })
        }

        const place = (rect: DOMRect | null | undefined) => {
          if (!popup || !rect) return
          popup.style.left = `${rect.left}px`
          popup.style.top = `${rect.bottom + 4}px`
        }

        return {
          onStart: (props: SuggestionProps<MentionItem>) => {
            items = props.items
            selected = 0
            command = props.command as (item: MentionItem) => void
            popup = document.createElement('div')
            popup.className =
              'fixed z-[200] min-w-[180px] max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md py-1'
            document.body.appendChild(popup)
            place(props.clientRect?.())
            paint()
          },
          onUpdate: (props: SuggestionProps<MentionItem>) => {
            items = props.items
            selected = 0
            command = props.command as (item: MentionItem) => void
            place(props.clientRect?.())
            paint()
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            const key = props.event?.key
            if (!items.length) return key === 'Escape'
            if (key === 'ArrowDown') {
              selected = (selected + 1) % items.length
              paint()
              return true
            }
            if (key === 'ArrowUp') {
              selected = (selected - 1 + items.length) % items.length
              paint()
              return true
            }
            if (key === 'Enter') {
              command(items[selected])
              return true
            }
            if (key === 'Escape') return true
            return false
          },
          onExit: () => {
            popup?.remove()
            popup = null
          },
        }
      },
    },
  })
}
