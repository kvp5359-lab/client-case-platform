import { Code } from '@tiptap/extension-code'
import { mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    coloredCode: {
      toggleColoredCode: (attrs?: { backgroundColor?: string; color?: string }) => ReturnType
      setCodeColor: (attrs: { backgroundColor?: string; color?: string }) => ReturnType
      unsetCodeColor: () => ReturnType
    }
  }
}

export const ColoredCode = Code.extend({
  name: 'code',

  addAttributes() {
    return {
      backgroundColor: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.backgroundColor) return {}
          return { style: `background-color: ${attributes.backgroundColor}` }
        },
      },
      color: {
        default: null,
        parseHTML: (element: HTMLElement) => element.style.color || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.color) return {}
          return { style: `color: ${attributes.color}` }
        },
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    // Tiptap mergeAttributes properly concatenates style strings
    return ['code', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      toggleColoredCode:
        (attrs) =>
        ({ commands, editor }) => {
          if (editor.isActive('code')) {
            return commands.unsetMark('code')
          }
          return commands.setMark('code', attrs || {})
        },
      setCodeColor:
        (attrs) =>
        ({ commands }) => {
          return commands.updateAttributes('code', attrs)
        },
      unsetCodeColor:
        () =>
        ({ commands }) => {
          return commands.updateAttributes('code', { backgroundColor: null, color: null })
        },
    }
  },
})
