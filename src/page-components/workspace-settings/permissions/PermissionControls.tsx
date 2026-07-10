/**
 * Компактные элементы для диалогов ролей: строка-переключатель, группа,
 * сетка тумблеров модулей. Всё рисуется из реестра прав.
 */

import { type ReactNode } from 'react'
import { AlertTriangle, type LucideIcon } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

// ── Компактная строка-переключатель ──────────────────────────────────────────

type PermissionToggleRowProps = {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description?: string
  danger?: boolean
  disabled?: boolean
}

export function PermissionToggleRow({
  checked,
  onChange,
  label,
  description,
  danger,
  disabled,
}: PermissionToggleRowProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer transition-colors',
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent/50',
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onChange(c as boolean)}
        disabled={disabled}
        className="shrink-0"
      />
      <span className="flex items-center gap-1.5 text-[13px] leading-tight">
        {label}
        {danger && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
      </span>
      {description && (
        <span className="ml-auto pl-2 text-[11px] text-muted-foreground truncate max-w-[45%] text-right">
          {description}
        </span>
      )}
    </label>
  )
}

// ── Группа прав ───────────────────────────────────────────────────────────────

type PermissionGroupProps = {
  title: ReactNode
  /** Пометка «новое» и т.п. */
  badge?: ReactNode
  children: ReactNode
}

export function PermissionGroup({ title, badge, children }: PermissionGroupProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        {badge}
        <span className="flex-1 h-px bg-border" />
      </div>
      <div className="rounded-lg border divide-y overflow-hidden">{children}</div>
    </div>
  )
}

// ── Тумблер модуля (чип) ──────────────────────────────────────────────────────

type ModuleToggleProps = {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  icon: LucideIcon
}

export function ModuleToggle({ checked, onChange, label, icon: Icon }: ModuleToggleProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors select-none',
        checked ? 'border-primary/40 bg-primary/5' : 'hover:bg-accent/50',
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={(c) => onChange(c as boolean)}
        className="shrink-0"
      />
      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-[12.5px] leading-tight truncate">{label}</span>
    </label>
  )
}
