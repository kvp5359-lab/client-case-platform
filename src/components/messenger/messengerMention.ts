/**
 * @-упоминания в композере (Tiptap Mention + suggestion) с МУЛЬТИВЫБОРОМ.
 * `@` открывает попап участников (аватарки/поиск-через-ввод/чекбоксы); отмечаешь
 * нескольких → «Упомянуть» вставляет все инлайн-теги сразу (@A @B @C).
 */
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { Editor, JSONContent, Range } from '@tiptap/core'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MentionMultiSelectPopup } from './MentionMultiSelectPopup'

export type MentionItem = { id: string; label: string; avatarUrl?: string | null }

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
        return getItems().filter((i) => !q || i.label.toLowerCase().includes(q))
      },
      render: () => {
        let container: HTMLDivElement | null = null
        let root: Root | null = null
        let editor: Editor | null = null
        let range: Range | null = null
        let filtered: MentionItem[] = []
        const selected = new Set<string>()

        const cleanup = () => {
          root?.unmount()
          root = null
          container?.remove()
          container = null
        }

        const insert = () => {
          if (!editor || !range || selected.size === 0) return
          const chosen = getItems().filter((i) => selected.has(i.id))
          const content: JSONContent[] = []
          chosen.forEach((it) => {
            content.push({ type: 'mention', attrs: { id: it.id, label: it.label } })
            content.push({ type: 'text', text: ' ' })
          })
          editor.chain().focus().insertContentAt(range, content).run()
          cleanup()
        }

        const renderPopup = () => {
          root?.render(
            createElement(MentionMultiSelectPopup, {
              items: filtered,
              selectedIds: selected,
              onToggle: (id: string) => {
                if (selected.has(id)) selected.delete(id)
                else selected.add(id)
                renderPopup()
              },
              onConfirm: insert,
            }),
          )
        }

        // Композер у нижнего края окна → попап над курсором (под не влезает).
        const place = (rect: DOMRect | null | undefined) => {
          if (!container || !rect) return
          const h = container.offsetHeight
          const above = rect.top - h - 6
          const top = above >= 4 ? above : rect.bottom + 6
          container.style.left = `${rect.left}px`
          container.style.top = `${Math.max(4, top)}px`
        }

        return {
          onStart: (props: SuggestionProps<MentionItem>) => {
            editor = props.editor
            range = props.range
            filtered = props.items
            container = document.createElement('div')
            container.className = 'fixed z-[200]'
            document.body.appendChild(container)
            root = createRoot(container)
            renderPopup()
            place(props.clientRect?.())
          },
          onUpdate: (props: SuggestionProps<MentionItem>) => {
            editor = props.editor
            range = props.range
            filtered = props.items
            renderPopup()
            place(props.clientRect?.())
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            const key = props.event?.key
            if (key === 'Escape') {
              cleanup()
              return true
            }
            if (key === 'Enter') {
              insert()
              return true
            }
            return false
          },
          onExit: () => cleanup(),
        }
      },
    },
  })
}
