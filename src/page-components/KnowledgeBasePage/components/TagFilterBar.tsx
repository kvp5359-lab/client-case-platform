import { useState } from 'react'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Check, X, Tag } from 'lucide-react'
import { safeCssColor } from '@/utils/isValidCssColor'
import type { useKnowledgeBasePage } from '../useKnowledgeBasePage'

type PageReturn = ReturnType<typeof useKnowledgeBasePage>

export function TagFilterBar({ page }: { page: PageReturn }) {
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#6B7280')
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const handleCreate = () => {
    const name = newName.trim()
    if (!name) return
    page.createTagMutation.mutate(
      { name, color: newColor },
      {
        onSuccess: () => {
          setIsAdding(false)
          setNewName('')
          setNewColor('#6B7280')
        },
      },
    )
  }

  const handleDelete = async (tagId: string, tagName: string) => {
    const ok = await confirm({
      title: 'Удалить тег?',
      description: `Тег "${tagName}" будет убран со всех статей.`,
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    page.deleteTagMutation.mutate(tagId)
  }

  return (
    <>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Tag className="w-3.5 h-3.5 text-muted-foreground" />
        {page.tags.length > 0 && (
          <button
            onClick={() => page.setFilterTagId(null)}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
              !page.filterTagId
                ? 'bg-primary text-primary-foreground'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Все
          </button>
        )}
        {page.tags.map((tag) => (
          <div key={tag.id} className="relative group/tag inline-flex">
            <button
              onClick={() => page.setFilterTagId(page.filterTagId === tag.id ? null : tag.id)}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors border ${
                page.filterTagId === tag.id ? 'text-white' : 'bg-white hover:bg-gray-50'
              }`}
              style={{
                borderColor: safeCssColor(tag.color),
                ...(page.filterTagId === tag.id
                  ? { backgroundColor: safeCssColor(tag.color) }
                  : { color: safeCssColor(tag.color) }),
              }}
            >
              {tag.name}
            </button>
            <button
              onClick={() => handleDelete(tag.id, tag.name)}
              aria-label={`Удалить тег ${tag.name}`}
              className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full items-center justify-center text-[8px] hidden group-hover/tag:flex [@media(hover:none)]:flex"
              title="Удалить тег"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        ))}
        {isAdding ? (
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="w-6 h-6 rounded cursor-pointer border-0 p-0"
            />
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
                if (e.key === 'Escape') setIsAdding(false)
              }}
              placeholder="Имя тега..."
              className="h-6 text-xs w-28"
              autoFocus
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleCreate}
              disabled={!newName.trim() || page.createTagMutation.isPending}
            >
              <Check className="w-3.5 h-3.5 text-green-600" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsAdding(false)}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="w-3 h-3 mr-1" />
            Тег
          </Button>
        )}
      </div>
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
