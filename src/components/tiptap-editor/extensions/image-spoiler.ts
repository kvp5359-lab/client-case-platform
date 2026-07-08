import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageSpoilerView } from '../node-views/image-spoiler-view'
import { imageFigureSpec } from '../node-views/image-shared'

export type ImageSpoilerOptions = {
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging требует interface
  interface Commands<ReturnType> {
    imageSpoiler: {
      setImageSpoiler: (attrs: { src: string; alt?: string; label?: string }) => ReturnType
    }
  }
}

/**
 * Инлайновый значок-«подсказка»: чип внутри текста, по клику разворачивается
 * картинка блоком под строкой и сворачивается обратно.
 *
 * Почему checkbox-hack, а не нативный <details> (как в accordion): статья вне
 * редактора рендерится как сырой HTML (dangerouslySetInnerHTML, без React/Tiptap).
 * <details> — flow-content, внутри <p> браузер-парсер разорвал бы абзац. Поэтому
 * сериализуемся в phrasing-элементы (span/input/label), которые валидны внутри
 * <p>, а сворачивание в статике держит чистый CSS `:checked ~ .media` — без JS,
 * без оверлея, не закрывается по клику мимо. В редакторе за UX отвечает NodeView.
 *
 * Настройки самой картинки (размер/ширина/рамка/тень/скругление/подпись) — те же,
 * что у ImageBlock: раскрытая картинка рендерится общим `imageFigureSpec`.
 */
export const ImageSpoiler = Node.create<ImageSpoilerOptions>({
  name: 'imageSpoiler',

  group: 'inline',

  inline: true,

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
      label: {
        default: 'подсказка',
        parseHTML: (element) => element.getAttribute('data-label') || 'подсказка',
      },
      // Уникальный id для связки <label for> ↔ <input id> в статичном рендере.
      uid: {
        default: '',
        parseHTML: (element) =>
          element.getAttribute('data-uid') || element.querySelector('input')?.getAttribute('id') || '',
      },
      // Настройки картинки — те же, что у ImageBlock (переиспользуем форму и рендер).
      caption: { default: '' },
      size: { default: 'original' },
      width: { default: 'auto' },
      borderWidth: { default: 'none' },
      borderColor: { default: '#d1d5db' },
      rounded: { default: 'lg' },
      shadow: { default: 'none' },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-type="image-spoiler"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return {}
          const el = node as HTMLElement
          const img = el.querySelector('img')
          const input = el.querySelector('input')
          const figure = el.querySelector('figure[data-type="image-block"]')
          const figcaption = el.querySelector('figcaption')
          return {
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || '',
            label: el.getAttribute('data-label') || el.querySelector('label')?.textContent || 'подсказка',
            uid: el.getAttribute('data-uid') || input?.getAttribute('id') || '',
            caption: figcaption?.textContent || '',
            size: figure?.getAttribute('data-size') || 'original',
            width: figure?.getAttribute('data-width') || 'auto',
            borderWidth: figure?.getAttribute('data-border-width') || 'none',
            borderColor: figure?.getAttribute('data-border-color') || '#d1d5db',
            rounded: figure?.getAttribute('data-rounded') || 'lg',
            shadow: figure?.getAttribute('data-shadow') || 'none',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const label = HTMLAttributes.label || 'подсказка'
    const uid = HTMLAttributes.uid || `is-${Math.random().toString(36).slice(2)}`

    return [
      'span',
      {
        ...this.options.HTMLAttributes,
        'data-type': 'image-spoiler',
        'data-label': label,
        'data-uid': uid,
        class: 'image-spoiler',
      },
      ['input', { type: 'checkbox', id: uid, class: 'image-spoiler-toggle' }],
      ['label', { for: uid, class: 'image-spoiler-chip' }, label],
      ['span', { class: 'image-spoiler-media' }, imageFigureSpec(HTMLAttributes)],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageSpoilerView)
  },

  addCommands() {
    return {
      setImageSpoiler:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              src: attrs.src,
              alt: attrs.alt || '',
              label: attrs.label || 'подсказка',
              uid:
                typeof crypto !== 'undefined' && crypto.randomUUID
                  ? `is-${crypto.randomUUID()}`
                  : `is-${Math.random().toString(36).slice(2)}`,
            },
          })
        },
    }
  },
})
