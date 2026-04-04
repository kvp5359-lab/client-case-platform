import { useState } from 'react'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Trash2, Pencil, Check } from 'lucide-react'
import { getTagColors, NotionPill, TAG_COLOR_PALETTE } from '@/utils/notionPill'
import { ColorPickerInline } from './ColorPickerInline'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function ManageTagsDialog({ page }: { page: PageReturn }) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(TAG_COLOR_PALETTE[0])
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    page.createTagMutation.mutate({ name, color: newColor })
    setNewName('')
    setNewColor(TAG_COLOR_PALETTE[0])
    setAdding(false)
  }

  const startEdit = (tag: { id: string; name: string; color: string }) => {
    setEditId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
    setAdding(false)
  }

  const handleSaveEdit = (id: string) => {
    const name = editName.trim()
    if (!name) return
    page.updateTagMutation.mutate({ id, name, color: editColor })
    setEditId(null)
    setEditName('')
  }

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Управление тегами</DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1 max-h-64 overflow-auto">
          {page.tags.map((tag) => {
            const c = getTagColors(tag.color)
            return (
              <div
                key={tag.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 group/item"
              >
                {editId === tag.id ? (
                  <>
                    <div className="flex items-center flex-1 gap-0 border rounded-md focus-within:ring-1 focus-within:ring-ring h-7">
                      <input
                        className="flex-1 min-w-0 h-full bg-transparent px-2 text-sm outline-none"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit(tag.id)
                          if (e.key === 'Escape') setEditId(null)
                        }}
                        autoFocus
                      />
                      <div className="pr-1.5 flex items-center">
                        <ColorPickerInline color={editColor} onChange={setEditColor} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => handleSaveEdit(tag.id)}
                    >
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <NotionPill name={tag.name} bg={c.bg} text={c.text} />
                    <span className="flex-1" />
                    <button
                      className="opacity-0 group-hover/item:opacity-100 transition-opacity"
                      onClick={() => startEdit(tag)}
                      title="Редактировать"
                      aria-label={`Редактировать тег ${tag.name}`}
                    >
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      className="opacity-0 group-hover/item:opacity-100 transition-opacity"
                      aria-label={`Удалить тег ${tag.name}`}
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Удалить тег?',
                          description: `Тег "${tag.name}" будет удалён со всех статей.`,
                          variant: 'destructive',
                          confirmText: 'Удалить',
                        })
                        if (!ok) return
                        page.deleteTagMutation.mutate(tag.id)
                      }}
                      title="Удалить"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </>
                )}
              </div>
            )
          })}
          {page.tags.length === 0 && !adding && (
            <p className="text-sm text-muted-foreground text-center py-4">Нет тегов</p>
          )}

          {adding && (
            <div className="flex items-center gap-2 px-2 py-1.5">
              <div className="flex items-center flex-1 gap-0 border rounded-md focus-within:ring-1 focus-within:ring-ring h-7">
                <input
                  placeholder="Название..."
                  className="flex-1 min-w-0 h-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd()
                    if (e.key === 'Escape') {
                      setAdding(false)
                      setNewName('')
                    }
                  }}
                  autoFocus
                />
                <div className="pr-1.5 flex items-center">
                  <ColorPickerInline color={newColor} onChange={setNewColor} />
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={handleAdd}
                disabled={!newName.trim()}
              >
                <Check className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {!adding && (
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2"
            onClick={() => {
              setAdding(true)
              setEditId(null)
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Добавить
          </button>
        )}
      </div>
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </DialogContent>
  )
}
