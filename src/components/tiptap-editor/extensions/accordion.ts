import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { AccordionView } from '../node-views/accordion-view'

export interface AccordionOptions {
  HTMLAttributes: Record<string, string>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    accordion: {
      setAccordion: (attrs?: { title?: string; open?: boolean }) => ReturnType
    }
  }
}

export const Accordion = Node.create<AccordionOptions>({
  name: 'accordion',

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
      title: {
        default: 'Заголовок',
        parseHTML: (element) => element.getAttribute('data-title') || 'Заголовок',
      },
      open: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-open') === 'true',
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'details[data-type="accordion"]',
        contentElement: '.accordion-content',
      },
      // Notion paste: <details><summary>Title</summary>content</details>
      {
        tag: 'details',
        getAttrs: (element) => {
          const el = element as HTMLDetailsElement
          const summary = el.querySelector('summary')
          return {
            title: summary?.textContent || 'Заголовок',
            open: el.hasAttribute('open'),
          }
        },
        contentElement: (element) => {
          const el = element as HTMLDetailsElement
          // Контент — всё кроме summary
          const div = document.createElement('div')
          Array.from(el.childNodes).forEach((child) => {
            if (child.nodeName !== 'SUMMARY') div.appendChild(child.cloneNode(true))
          })
          // Если пусто — добавить параграф
          if (!div.childNodes.length) {
            div.appendChild(document.createElement('p'))
          }
          return div
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const title = HTMLAttributes.title || 'Заголовок'

    return [
      'details',
      mergeAttributes(this.options.HTMLAttributes, {
        'data-type': 'accordion',
        'data-title': title,
        class: 'accordion my-4 rounded-lg',
      }),
      ['summary', {}, title],
      ['div', { class: 'accordion-content px-4 pb-4' }, 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AccordionView)
  },

  addCommands() {
    return {
      setAccordion:
        (attrs) =>
        ({ commands, state }) => {
          const { from, to } = state.selection
          const content = state.doc.textBetween(from, to, ' ')

          if (content) {
            return commands.insertContent({
              type: this.name,
              attrs: {
                title: attrs?.title || 'Заголовок',
                open: attrs?.open ?? true,
              },
              content: [
                {
                  type: 'paragraph',
                  content: state.doc.slice(from, to).content.toJSON(),
                },
              ],
            })
          }

          return commands.insertContent({
            type: this.name,
            attrs: {
              title: attrs?.title || 'Заголовок',
              open: attrs?.open ?? true,
            },
            content: [{ type: 'paragraph' }],
          })
        },
    }
  },
})
