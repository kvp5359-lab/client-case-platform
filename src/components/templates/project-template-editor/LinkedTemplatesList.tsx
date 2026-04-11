import { type LucideIcon } from 'lucide-react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LinkedItem {
  id: string
  name: string
}

interface LinkedTemplatesListProps {
  title: string
  count: number
  items: LinkedItem[]
  icon: LucideIcon
  onAdd: () => void
  onRemove: (id: string) => void
  isRemoving: boolean
}

export function LinkedTemplatesList({
  title: _title,
  count: _count,
  items,
  icon: Icon,
  onAdd,
  onRemove,
  isRemoving,
}: LinkedTemplatesListProps) {
  return (
    <div className="bg-muted/20 px-4 py-2.5 border-t">
      <div className="space-y-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between py-1 px-2 rounded group hover:bg-background/60 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm truncate">{item.name}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
              onClick={(e) => {
                e.stopPropagation()
                onRemove(item.id)
              }}
              disabled={isRemoving}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          className="h-7 text-xs text-muted-foreground"
        >
          <Plus className="w-3 h-3 mr-1" />
          Добавить
        </Button>
      </div>
    </div>
  )
}
