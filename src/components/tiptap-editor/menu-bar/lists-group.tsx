import type { Editor } from '@tiptap/react'
import { List, ListOrdered } from 'lucide-react'
import { ToolbarPlainButton } from './toolbar-button'

interface ListsGroupProps {
  editor: Editor
}

export function ListsGroup({ editor }: ListsGroupProps) {
  return (
    <>
      <ToolbarPlainButton
        icon={List}
        isActive={editor.isActive('bulletList')}
        onAction={() => editor.chain().focus().toggleBulletList().run()}
        title="Маркированный список"
      />
      <ToolbarPlainButton
        icon={ListOrdered}
        isActive={editor.isActive('orderedList')}
        onAction={() => editor.chain().focus().toggleOrderedList().run()}
        title="Нумерованный список"
      />
    </>
  )
}
