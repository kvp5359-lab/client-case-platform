"use client"

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface ProjectTemplate {
  id: string
  name: string
}

interface TemplateSelectorProps {
  value: string
  onChange: (value: string) => void
  templates: ProjectTemplate[]
  disabled?: boolean
}

export function TemplateSelector({ value, onChange, templates, disabled }: TemplateSelectorProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="template">Тип проекта</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="template">
          <SelectValue placeholder="Выберите тип проекта (необязательно)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Без типа</SelectItem>
          {templates.map((template) => (
            <SelectItem key={template.id} value={template.id}>
              {template.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {templates.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Типы проектов можно создать в настройках workspace
        </p>
      )}
    </div>
  )
}
