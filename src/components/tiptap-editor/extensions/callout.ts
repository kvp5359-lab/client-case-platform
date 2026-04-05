import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CalloutView } from '../node-views/callout-view'

export interface CalloutOptions {
  HTMLAttributes: Record<string, string>
}

// Типы вынесены в callout-types.ts, чтобы callout-view.tsx не образовывал цикл
import type { CalloutIcon, CalloutColor } from './callout-types'
export type { CalloutIcon, CalloutColor }

// Обратная совместимость со старыми каллаутами
export const iconEmojis: Record<string, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  success: '✅',
  error: '❌',
  tip: '💡',
  note: '📝',
  question: '❓',
}

const LAST_EMOJI_KEY = 'callout_last_emoji'
const LAST_COLOR_KEY = 'callout_last_color'

const getDefaultEmoji = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(LAST_EMOJI_KEY) || 'ℹ️'
  }
  return 'ℹ️'
}

const getDefaultColor = (): CalloutColor => {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem(LAST_COLOR_KEY) as CalloutColor) || 'blue'
  }
  return 'blue'
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { icon?: CalloutIcon; color?: CalloutColor }) => ReturnType
      toggleCallout: (attrs?: { icon?: CalloutIcon; color?: CalloutColor }) => ReturnType
    }
  }
}

export const Callout = Node.create<CalloutOptions>({
  name: 'callout',

  group: 'block',

  content: 'block+',

  draggable: true,

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    }
  },

  addAttributes() {
    return {
      icon: {
        default: () => getDefaultEmoji(),
        parseHTML: (element) => {
          const val = element.getAttribute('data-icon') || 'ℹ️'
          return iconEmojis[val] || val
        },
      },
      color: {
        default: () => getDefaultColor(),
        parseHTML: (element) => element.getAttribute('data-color') || 'blue',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
        contentElement: '.callout-content',
      },
      // Notion paste: <aside><p>текст</p></aside>
      {
        tag: 'aside',
        getAttrs: () => ({
          icon: '',
          color: 'gray',
        }),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const rawIcon = (HTMLAttributes.icon as string) || ''
    const color = (HTMLAttributes.color as CalloutColor) || 'blue'
    const emoji = rawIcon ? iconEmojis[rawIcon] || rawIcon : ''

    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-type': 'callout',
        'data-icon': emoji,
        'data-color': color,
      }),
      ['span', { class: 'callout-icon' }, emoji],
      ['div', { class: 'callout-content' }, 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView)
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands, state, chain }) => {
          const defaultAttrs = {
            icon: getDefaultEmoji(),
            color: getDefaultColor(),
            ...attrs,
          }

          const { from, to, empty } = state.selection

          // No selection — insert empty callout
          if (empty) {
            return commands.insertContent({
              type: this.name,
              attrs: defaultAttrs,
              content: [{ type: 'paragraph' }],
            })
          }

          // Collect all fully or partially covered top-level block nodes
          const blocks: Array<Record<string, unknown>> = []
          state.doc.nodesBetween(from, to, (node, pos, parent) => {
            // Only direct children of the document (top-level blocks)
            if (parent?.type !== state.doc.type) return
            if (!node.isBlock) return

            const nodeFrom = pos
            const nodeTo = pos + node.nodeSize

            // Slice the part of this block that's within the selection
            const sliceFrom = Math.max(from, nodeFrom)
            const sliceTo = Math.min(to, nodeTo)

            if (sliceFrom >= sliceTo) return

            if (node.type.name === 'paragraph' || node.type.name === 'heading') {
              // Collect only the inline content within the selection range
              const inlineContent: Array<Record<string, unknown>> = []
              node.forEach((child, offset) => {
                const childFrom = nodeFrom + 1 + offset
                const childTo = childFrom + child.nodeSize
                if (childFrom >= sliceTo || childTo <= sliceFrom) return
                inlineContent.push(child.toJSON() as Record<string, unknown>)
              })
              if (inlineContent.length > 0) {
                blocks.push({
                  type: node.type.name,
                  ...(node.type.name === 'heading'
                    ? { attrs: node.attrs as Record<string, unknown> }
                    : {}),
                  content: inlineContent,
                })
              }
            } else {
              // For other block types (lists etc), include the full node
              blocks.push(node.toJSON() as Record<string, unknown>)
            }
          })

          if (blocks.length === 0) {
            return commands.insertContent({
              type: this.name,
              attrs: defaultAttrs,
              content: [{ type: 'paragraph' }],
            })
          }

          return chain()
            .deleteSelection()
            .insertContent({
              type: this.name,
              attrs: defaultAttrs,
              content: blocks,
            })
            .run()
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs)
        },
    }
  },
})
