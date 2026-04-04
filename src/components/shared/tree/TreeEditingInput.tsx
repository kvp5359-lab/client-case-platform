/**
 * Inline editing input for tree group names.
 * Used by GroupTreeItem and QuickReplyGroupTreeItem.
 */

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Check, X } from 'lucide-react'

interface TreeEditingInputProps {
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
}

export function TreeEditingInput({ value, onChange, onSave, onCancel }: TreeEditingInputProps) {
  return (
    <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
        className="h-6 text-sm flex-1"
        autoFocus
      />
      <Button variant="ghost" size="sm" onClick={onSave} className="h-6 w-6 p-0">
        <Check className="w-3.5 h-3.5 text-green-600" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 w-6 p-0">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}
