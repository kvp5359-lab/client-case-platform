/**
 * Компонент секции разрешений модуля
 */

import { ChevronDown, ChevronRight, Settings } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface ModulePermissionsSectionProps {
  title: string
  icon: typeof Settings
  expanded: boolean
  onToggle: () => void
  permissions: Array<{ key: string; label: string; value: boolean }>
  onChange: (key: string, value: boolean) => void
}

export function ModulePermissionsSection({
  title,
  icon: Icon,
  expanded,
  onToggle,
  permissions,
  onChange,
}: ModulePermissionsSectionProps) {
  return (
    <div className="border rounded-lg">
      <button
        className="w-full flex items-center gap-2 p-3 hover:bg-accent/50 transition-colors"
        onClick={onToggle}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <Icon className="h-4 w-4" />
        <span className="font-medium">{title}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {permissions.map(({ key, label, value }) => (
            <div key={key} className="flex items-center gap-3 p-2 rounded hover:bg-accent/30">
              <Checkbox
                id={`perm-${key}`}
                checked={value}
                onCheckedChange={(checked) => onChange(key, checked as boolean)}
              />
              <Label htmlFor={`perm-${key}`} className="cursor-pointer text-sm">
                {label}
              </Label>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
