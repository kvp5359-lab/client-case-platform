import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { ColumnView } from '../node-views/column-view'

// Типы и константы вынесены в columns-types.ts — чтобы node-view не создавал цикл
export type { ColumnCount, BorderRadius } from './columns-types'
export { COLUMN_BG_COLORS } from './columns-types'
import type { ColumnCount } from './columns-types'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      setColumns: (count?: ColumnCount) => ReturnType
    }
  }
}

// Контейнер колонок
export const Columns = Node.create({
  name: 'columns',

  group: 'block',

  content: 'column{2,3}',

  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (element) => parseInt(element.getAttribute('data-count') || '2', 10),
        renderHTML: (attributes) => ({
          'data-count': attributes.count,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'columns',
        class: 'columns-container',
        style: 'display: grid; gap: 16px; width: 100%; margin: 16px 0;',
      }),
      0,
    ]
  },

  addCommands() {
    return {
      setColumns:
        (count = 2) =>
        ({ commands }) => {
          const columns = Array.from({ length: count }, () => ({
            type: 'column',
            attrs: { bgColor: null, borderRadius: 'none' },
            content: [{ type: 'paragraph' }],
          }))

          return commands.insertContent({
            type: this.name,
            attrs: { count },
            content: columns,
          })
        },
    }
  },
})

// Отдельная колонка с настройками фона
export const Column = Node.create({
  name: 'column',

  group: 'column',

  content: 'block+',

  defining: true,

  addAttributes() {
    return {
      bgColor: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-bg-color') || null,
        renderHTML: (attributes) => {
          if (!attributes.bgColor) return {}
          return { 'data-bg-color': attributes.bgColor }
        },
      },
      borderRadius: {
        default: 'none',
        parseHTML: (element) => element.getAttribute('data-border-radius') || 'none',
        renderHTML: (attributes) => ({
          'data-border-radius': attributes.borderRadius,
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const bgColor = HTMLAttributes['data-bg-color']
    const borderRadius = HTMLAttributes['data-border-radius'] || 'none'

    const radiusClasses: Record<string, string> = {
      none: '',
      sm: 'rounded-sm',
      md: 'rounded-md',
      lg: 'rounded-lg',
      xl: 'rounded-xl',
    }

    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        class: `column-item ${radiusClasses[borderRadius]}`,
        style: bgColor ? `background-color: ${bgColor}; padding: 16px;` : undefined,
      }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView)
  },
})
