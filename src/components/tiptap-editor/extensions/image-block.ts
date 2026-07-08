import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageBlockView } from '../node-views/image-block-view'
import { imageFigureSpec } from '../node-views/image-shared'

export type ImageBlockOptions = {
  HTMLAttributes: Record<string, string>
}

// Типы вынесены в image-block-types.ts — чтобы node-view не образовывал цикл
export type {
  ImageSize,
  ImageRounded,
  ImageBorderWidth,
  ImageShadow,
  ImageWidth,
} from './image-block-types'
import type {
  ImageSize,
  ImageRounded,
  ImageBorderWidth,
  ImageShadow,
  ImageWidth,
} from './image-block-types'

declare module '@tiptap/core' {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- declaration merging требует interface
  interface Commands<ReturnType> {
    imageBlock: {
      setImageBlock: (attrs: {
        src: string
        alt?: string
        caption?: string
        size?: ImageSize
        width?: ImageWidth
        borderWidth?: ImageBorderWidth
        borderColor?: string
        rounded?: ImageRounded
        shadow?: ImageShadow
      }) => ReturnType
    }
  }
}

export const ImageBlock = Node.create<ImageBlockOptions>({
  name: 'imageBlock',

  group: 'block',

  atom: true,

  draggable: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: '' },
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
        tag: 'figure[data-type="image-block"]',
        getAttrs: (node) => {
          if (typeof node === 'string') return {}
          const element = node as HTMLElement
          const img = element.querySelector('img')
          const figcaption = element.querySelector('figcaption')
          return {
            src: img?.getAttribute('src') || '',
            alt: img?.getAttribute('alt') || '',
            caption: figcaption?.textContent || '',
            size: element.getAttribute('data-size') || 'original',
            width: element.getAttribute('data-width') || 'auto',
            borderWidth: element.getAttribute('data-border-width') || 'none',
            borderColor: element.getAttribute('data-border-color') || '#d1d5db',
            rounded: element.getAttribute('data-rounded') || 'lg',
            shadow: element.getAttribute('data-shadow') || 'none',
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return imageFigureSpec(HTMLAttributes, this.options.HTMLAttributes)
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView)
  },

  addCommands() {
    return {
      setImageBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          })
        },
    }
  },
})
