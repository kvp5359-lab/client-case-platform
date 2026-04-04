"use client"

import { Loader2, AlertCircle } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { TemplateWithFields } from './useAddFormKit'

interface TemplateStepProps {
  templates: TemplateWithFields[]
  loadingTemplates: boolean
  selectedTemplateId: string | null
  existingKitTemplateIds: string[]
  templateFormIds: string[]
  onToggle: (templateId: string) => void
}

interface TemplateRowProps {
  template: TemplateWithFields
  isSelected: boolean
  isAlreadyAdded: boolean
  isHighlighted: boolean
  onToggle: (id: string) => void
}

function TemplateRow({
  template,
  isSelected,
  isAlreadyAdded,
  isHighlighted,
  onToggle,
}: TemplateRowProps) {
  return (
    <div
      className={`flex items-center gap-3 py-1.5 px-2 rounded transition-colors ${
        isAlreadyAdded
          ? 'opacity-50 cursor-not-allowed bg-red-50'
          : isHighlighted
            ? 'hover:bg-background/60 cursor-pointer'
            : 'hover:bg-muted/30 cursor-pointer'
      }`}
      onClick={() => !isAlreadyAdded && onToggle(template.id)}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => !isAlreadyAdded && onToggle(template.id)}
        disabled={isAlreadyAdded}
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${isAlreadyAdded ? 'font-bold line-through text-destructive' : 'font-medium'}`}
        >
          {template.name}
        </p>
        {isAlreadyAdded && <p className="text-xs text-destructive">Уже добавлена</p>}
      </div>
    </div>
  )
}

export function TemplateStep({
  templates,
  loadingTemplates,
  selectedTemplateId,
  existingKitTemplateIds,
  templateFormIds,
  onToggle,
}: TemplateStepProps) {
  if (loadingTemplates) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Нет доступных шаблонов анкет</p>
        <p className="text-sm text-muted-foreground mt-2">
          Создайте шаблоны в разделе «Настройки → Шаблоны»
        </p>
      </div>
    )
  }

  const projectTemplates = templates.filter((t) => templateFormIds.includes(t.id))
  const otherTemplates = templates.filter((t) => !templateFormIds.includes(t.id))

  return (
    <div className="space-y-4">
      {existingKitTemplateIds.length > 0 && (
        <Alert variant="default" className="bg-amber-50 border-amber-200">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Анкеты с <strong>жирным</strong> названием уже добавлены в этот проект
          </AlertDescription>
        </Alert>
      )}

      {projectTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground px-1">
            Добавлены в тип проекта
          </h3>
          <div className="space-y-1 border rounded-lg p-3 bg-muted/20">
            {projectTemplates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                isAlreadyAdded={existingKitTemplateIds.includes(template.id)}
                isHighlighted
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}

      {otherTemplates.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-muted-foreground px-1">Другие шаблоны</h3>
          <div className="space-y-1 border rounded-lg p-3">
            {otherTemplates.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                isSelected={selectedTemplateId === template.id}
                isAlreadyAdded={existingKitTemplateIds.includes(template.id)}
                isHighlighted={false}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
