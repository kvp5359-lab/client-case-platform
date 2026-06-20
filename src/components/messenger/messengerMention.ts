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
      class: 'mention rounded px-1 py-0.5 bg-neutral-200 text-neutral-800',
    },
    suggestion: {
      char: '@',
      // Отдаём ВСЕХ — поиск делает само поле в попапе (видимый input).
      items: (): MentionItem[] => getItems(),
      render: () => {
        let container: HTMLDivElement | null = null
        let root: Root | null = null
        let editor: Editor | null = null
        let range: Range | null = null
        let inserted = false
        let outsideHandler: ((e: MouseEvent) => void) | null = null

        // Закрытие. removeTrigger=true (отмена) → удаляем незавершённый «@…»,
        // чтобы не оставлять висячий символ. После вставки (inserted) триггер уже
        // заменён на упоминания — не трогаем.
        const cleanup = (removeTrigger = false) => {
          if (!container) return
          if (removeTrigger && !inserted && editor && range) {
            try {
              editor.chain().focus().deleteRange(range).run()
            } catch {
              /* range мог сдвинуться — игнорируем */
            }
          }
          if (outsideHandler) {
            document.removeEventListener('mousedown', outsideHandler, true)
            outsideHandler = null
          }
          root?.unmount()
          root = null
          container.remove()
          container = null
        }

        const insert = (ids: string[]) => {
          if (!editor || !range || ids.length === 0) {
            cleanup(true)
            return
          }
          const chosen = getItems().filter((i) => ids.includes(i.id))
          const content: JSONContent[] = []
          chosen.forEach((it) => {
            content.push({ type: 'mention', attrs: { id: it.id, label: it.label } })
            content.push({ type: 'text', text: ' ' })
          })
          editor.chain().focus().insertContentAt(range, content).run()
          inserted = true
          cleanup()
        }

        // Композер у нижнего края окна → попап НАД курсором. Якорим низ попапа
        // к курсору (растёт вверх) — без замера высоты.
        const place = (rect: DOMRect | null | undefined) => {
          if (!container || !rect) return
          container.style.left = `${rect.left}px`
          container.style.top = 'auto'
          container.style.bottom = `${Math.max(4, window.innerHeight - rect.top + 6)}px`
        }

        return {
          // Монтируем попап ОДИН раз — он держит своё состояние (поиск/выбор).
          onStart: (props: SuggestionProps<MentionItem>) => {
            editor = props.editor
            range = props.range
            container = document.createElement('div')
            container.className = 'fixed z-[200]'
            document.body.appendChild(container)
            // Клик мимо попапа = отмена (удаляем висячий «@»).
            outsideHandler = (e: MouseEvent) => {
              if (container && !container.contains(e.target as Node)) cleanup(true)
            }
            document.addEventListener('mousedown', outsideHandler, true)
            root = createRoot(container)
            root.render(
              createElement(MentionMultiSelectPopup, {
                items: props.items,
                onConfirm: insert,
                onClose: () => cleanup(true),
              }),
            )
            place(props.clientRect?.())
          },
          // Только репозиция (не ре-рендерим — иначе сбросится поиск/выбор).
          onUpdate: (props: SuggestionProps<MentionItem>) => {
            editor = props.editor
            range = props.range
            place(props.clientRect?.())
          },
          onKeyDown: (props: SuggestionKeyDownProps) => {
            if (props.event?.key === 'Escape') {
              cleanup(true)
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
