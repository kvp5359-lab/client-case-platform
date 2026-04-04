/**
 * Inline input for adding a subgroup in tree views.
 * Used by GroupTreeItem and QuickReplyGroupTreeItem.
 */

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FolderPlus, Check, X } from 'lucide-react'
import { BASE_PAD, INDENT } from './TreeConstants'

interface AddSubgroupInputProps {
  depth: number
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onCancel: () => void
  isSaving?: boolean
}

export function AddSubgroupInput({
  depth,
  value,
  onChange,
  onSave,
  onCancel,
  isSaving,
}: AddSubgroupInputProps) {
  return (
    <div
      className="flex items-center gap-1.5 h-7 px-2"
      style={{ paddingLeft: `${BASE_PAD + (depth + 1) * INDENT}px` }}
    >
      <FolderPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder="Название подгруппы..."
        className="h-6 text-sm flex-1"
        autoFocus
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        disabled={!value.trim() || isSaving}
        className="h-6 w-6 p-0"
      >
        <Check className="w-3.5 h-3.5 text-green-600" />
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 w-6 p-0">
        <X className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}
