import type { Editor } from '@tiptap/react'
import { Undo, Redo } from 'lucide-react'
import { ToolbarButton } from './toolbar-button'

interface HistoryGroupProps {
  editor: Editor
}

export function HistoryGroup({ editor }: HistoryGroupProps) {
  return (
    <>
      <ToolbarButton
        icon={Undo}
        onAction={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Отменить"
      />
      <ToolbarButton
        icon={Redo}
        onAction={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Повторить"
      />
    </>
  )
}
