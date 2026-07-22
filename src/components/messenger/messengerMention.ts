/**
 * @-упоминания в композере (Tiptap Mention + suggestion), ОДИНОЧНЫЙ выбор — как
 * в Telegram/Slack. `@` открывает попап участников (аватарки/поиск/навигация
 * ↑↓); клик или Enter по строке сразу вставляет тег и закрывает попап. Ещё
 * упоминание — снова «@».
 */
import Mention from '@tiptap/extension-mention'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import type { Editor, JSONContent, Range } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MentionPickerPopup } from './MentionPickerPopup'

// Флажок «сейчас идёт вставка из буфера». Пока он поднят, suggestion.allow не
// открывает список — чтобы вставленный текст с «@» (например «@rs_help102_bot»
// из буфера) НЕ триггерил попап. Ручной ввод «@» с клавиатуры / кнопкой попап
// открывает как обычно. Флажок живёт один тик: handlePaste ставит его синхронно
// перед стандартной вставкой, транзакция вставки обрабатывается плагином
// suggestion в том же цикле (флажок ещё поднят), затем setTimeout(0) снимает.
let pasteInProgress = false

export type MentionItem = {
  id: string
  label: string
  avatarUrl?: string | null
  /** Группа в пикере: связанные с задачей / остальные сотрудники воркспейса. */
  group?: 'related' | 'staff'
}

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
  return Mention.extend({
    // Плагин ловит вставку из буфера и поднимает флажок на один тик.
    addProseMirrorPlugins() {
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          key: new PluginKey('mentionPasteGuard'),
          props: {
            handlePaste: () => {
              pasteInProgress = true
              setTimeout(() => {
                pasteInProgress = false
              }, 0)
              return false // не мешаем стандартной вставке
            },
          },
        }),
      ]
    },
  }).configure({
    HTMLAttributes: {
      class: 'mention rounded px-1 py-0.5 bg-neutral-200 text-neutral-800',
    },
    // Backspace удаляет упоминание ВМЕСТЕ с триггером «@» (true). При false
    // (дефолт) символ «@» остаётся → курсор сразу после него → suggestion
    // переоткрывает список. Поэтому именно true.
    deleteTriggerWithBackspace: true,
    suggestion: {
      char: '@',
      // Не открывать список, если «@» появился вставкой из буфера (см. флажок).
      allow: () => !pasteInProgress,
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

        const insert = (id: string) => {
          const it = getItems().find((i) => i.id === id)
          if (!editor || !range || !it) {
            cleanup(true)
            return
          }
          const content: JSONContent[] = [
            { type: 'mention', attrs: { id: it.id, label: it.label } },
            { type: 'text', text: ' ' },
          ]
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
              createElement(MentionPickerPopup, {
                items: props.items,
                onSelect: insert,
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
            // Навигация/выбор идут в поле поиска попапа (оно в фокусе). Здесь ловим
            // только Escape/Enter на случай, если фокус всё же в редакторе:
            // закрываем и гасим Enter, чтобы ProseMirror не разбил блок и не
            // оставил висячий «@».
            if (props.event?.key === 'Escape' || props.event?.key === 'Enter') {
              cleanup(true)
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
