/**
 * Компонент для ввода названия (папки, документа и т.д.)
 */

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface NameInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  label?: string
  id?: string
  className?: string
  disabled?: boolean
}

export function NameInput({
  value,
  onChange,
  placeholder = 'Введите название папки',
  label = 'Название папки',
  id = 'folder-name',
  className,
  disabled,
}: NameInputProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="!text-2xl !font-bold !h-12 py-2"
      />
    </div>
  )
}

