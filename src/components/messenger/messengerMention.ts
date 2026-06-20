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
    // Backspace удаляет упоминание ВМЕСТЕ с триггером «@» (true). При false
    // (дефолт) символ «@» остаётся → курсор сразу после него → suggestion
    // переоткрывает список. Поэтому именно true.
    deleteTriggerWithBackspace: true,
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
        let done = false
        // Текущий выбор в попапе — чтобы Enter из РЕДАКТОРА подтверждал «Упомянуть».
        let selectedIds: string[] = []

        // Закрытие. removeTrigger=true (отмена) → удаляем незавершённый «@…».
        // Идемпотентно: removeTrigger (deleteRange) синхронно завершает suggestion
        // → onExit → вложенный cleanup; флаг done + снапшот рефов защищают от гонки.
        const cleanup = (removeTrigger = false) => {
          if (done) return
          done = true
          const c = container
          const r = root
          const ed = editor
          const rng = range
          const oh = outsideHandler
          container = null
          root = null
          outsideHandler = null
          if (oh) document.removeEventListener('mousedown', oh, true)
          if (removeTrigger && !inserted && ed && rng) {
            try {
              ed.chain().focus().deleteRange(rng).run()
            } catch {
              /* range мог сдвинуться — игнорируем */
            }
          }
          // Размонтируем ВНЕ текущего цикла событий: root.unmount() синхронно из
          // обработчика внутри этого же React-рута (клик по «×»/«Упомянуть»)
          // React 19 откладывает/глотает → попап не закрывался. setTimeout(0)
          // выводит из render-фазы. Outside-click шёл от document → закрывал ок.
          setTimeout(() => {
            r?.unmount()
            c?.remove()
          }, 0)
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
            // ⚠️ render() вызывается ОДИН раз на плагин — переменные замыкания
            // общие для ВСЕХ открытий. Без сброса `done` остаётся true после
            // первого закрытия → cleanup() второго попапа упирается в `if (done)
            // return` и НИЧЕГО не закрывает. Сбрасываем состояние сессии здесь.
            done = false
            inserted = false
            selectedIds = []
            editor = props.editor
            range = props.range
            // Самолечение: сносим осиротевшие попапы (HMR/гонки teardown могут
            // оставить «зомби»-контейнер). Гарантирует ровно один живой попап.
            document.querySelectorAll('.cc-mention-popup').forEach((el) => el.remove())
            container = document.createElement('div')
            container.className = 'cc-mention-popup fixed z-[200]'
            document.body.appendChild(container)
            // Клик мимо попапа = отмена (удаляем висячий «@»).
            outsideHandler = (e: MouseEvent) => {
              const inside = !!container && container.contains(e.target as Node)
              if (container && !inside) cleanup(true)
            }
            document.addEventListener('mousedown', outsideHandler, true)
            root = createRoot(container)
            root.render(
              createElement(MentionMultiSelectPopup, {
                items: props.items,
                onConfirm: insert,
                onClose: () => cleanup(true),
                onSelectionChange: (ids) => {
                  selectedIds = ids
                },
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
            // Enter из редактора (фокус не в поле поиска): есть выбор → вставляем
            // упоминания, иначе отменяем висячий «@». В любом случае гасим Enter,
            // чтобы ProseMirror не разбил блок и не оставил «@».
            if (props.event?.key === 'Enter') {
              if (selectedIds.length > 0) insert(selectedIds)
              else cleanup(true)
              return true
            }
            return false
          },
          onExit: () => {
            cleanup()
          },
        }
      },
    },
  })
}
