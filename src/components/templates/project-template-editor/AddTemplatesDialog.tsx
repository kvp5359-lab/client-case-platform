/**
 * Универсальный диалог добавления шаблонов (анкет или наборов документов)
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

interface Template {
  id: string
  name: string
  description?: string | null
}

interface AddTemplatesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  emptyMessage: string
  templates: Template[]
  selectedIds: string[]
  onToggleSelection: (id: string) => void
  onAdd: () => void
  onCancel: () => void
  isPending: boolean
}

export function AddTemplatesDialog({
  open,
  onOpenChange,
  title,
  description,
  emptyMessage,
  templates,
  selectedIds,
  onToggleSelection,
  onAdd,
  onCancel,
  isPending,
}: AddTemplatesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[400px] overflow-y-auto">
          {templates.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{emptyMessage}</p>
          ) : (
            <div className="space-y-2">
              {templates.map((template) => (
                <label
                  key={template.id}
                  className="flex items-start gap-3 p-3 border rounded-lg hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selectedIds.includes(template.id)}
                    onCheckedChange={() => onToggleSelection(template.id)}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{template.name}</p>
                    {template.description && (
                      <p className="text-sm text-muted-foreground">{template.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Отмена
          </Button>
          <Button onClick={onAdd} disabled={selectedIds.length === 0 || isPending}>
            {isPending ? 'Добавление...' : `Добавить (${selectedIds.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
