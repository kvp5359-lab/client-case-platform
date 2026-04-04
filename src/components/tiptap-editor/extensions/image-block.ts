import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ImageBlockView } from '../node-views/image-block-view'

export interface ImageBlockOptions {
  HTMLAttributes: Record<string, string>
}

export type ImageSize = 'small' | 'medium' | 'large' | 'original'
export type ImageRounded = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ImageBorderWidth = 'none' | 'thin' | 'medium' | 'thick'
export type ImageShadow = 'none' | 'sm' | 'md' | 'lg' | 'xl'
export type ImageWidth = 'auto' | '20' | '40' | '60' | '80' | '100'

declare module '@tiptap/core' {
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
    const roundedClasses: Record<string, string> = {
      none: 'rounded-none',
      sm: 'rounded-xl',
      md: 'rounded-2xl',
      lg: 'rounded-3xl',
      xl: 'rounded-[2rem]',
    }
    const borderWidthValues: Record<string, number> = {
      none: 0,
      thin: 1,
      medium: 2,
      thick: 4,
    }
    const shadowStyles: Record<string, string> = {
      none: '',
      sm: '0 0 8px rgba(0,0,0,0.12)',
      md: '0 0 16px rgba(0,0,0,0.15)',
      lg: '0 0 28px rgba(0,0,0,0.18)',
      xl: '0 0 40px rgba(0,0,0,0.22)',
    }

    const roundedClass = roundedClasses[HTMLAttributes.rounded] || roundedClasses.lg
    const shadowValue = shadowStyles[HTMLAttributes.shadow] || ''
    const bw = borderWidthValues[HTMLAttributes.borderWidth] || 0
    const borderColor = HTMLAttributes.borderColor || '#d1d5db'
    const borderInline = bw > 0 ? `border: ${bw}px solid ${borderColor};` : ''
    const shadowInline = shadowValue ? `box-shadow: ${shadowValue};` : ''
    const widthStyle = HTMLAttributes.width === 'auto' ? 'fit-content' : `${HTMLAttributes.width}%`

    return [
      'figure',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-type': 'image-block',
        'data-size': HTMLAttributes.size,
        'data-width': HTMLAttributes.width || 'auto',
        'data-border-width': HTMLAttributes.borderWidth || 'none',
        'data-border-color': borderColor,
        'data-rounded': HTMLAttributes.rounded || 'lg',
        'data-shadow': HTMLAttributes.shadow || 'none',
        class: `my-6 ${roundedClass} overflow-hidden`,
        style: `display: block; width: ${widthStyle}; ${borderInline} ${shadowInline}`,
      }),
      [
        'img',
        {
          src: HTMLAttributes.src,
          alt: HTMLAttributes.alt || '',
          class: `w-full h-auto ${roundedClass}`,
          style: 'max-width: 100%; height: auto; display: block;',
        },
      ],
      HTMLAttributes.caption
        ? [
            'figcaption',
            { class: 'text-center text-sm text-gray-500 mt-2' },
            HTMLAttributes.caption,
          ]
        : '',
    ]
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
