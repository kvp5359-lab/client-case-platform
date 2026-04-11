/**
 * PlaceholderMappingDialog — привязка плейсхолдеров DOCX к полям анкет.
 *
 * Показывает список плейсхолдеров из шаблона и позволяет выбрать,
 * какое поле (field_definition) подставлять вместо каждого плейсхолдера.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { useUpdateDocumentTemplate } from '@/hooks/documents/useDocumentTemplates'
import type {
  DocumentTemplate,
  DocumentTemplatePlaceholder,
} from '@/services/api/documents/documentTemplateService'
import { FIELD_TYPE_LABELS } from './field-definition/constants'
import { cn } from '@/lib/utils'
import { fieldDefinitionKeys } from '@/hooks/queryKeys'

interface FieldDefinition {
  id: string
  name: string
  field_type: string
}

interface PlaceholderMappingDialogProps {
  template: DocumentTemplate
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function FieldCombobox({
  fields,
  value,
  onChange,
}: {
  fields: FieldDefinition[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedField = fields.find((f) => f.id === value)

  const filtered = useMemo(() => {
    if (!search.trim()) return fields
    const q = search.toLowerCase()
    return fields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (FIELD_TYPE_LABELS[f.field_type] || f.field_type).toLowerCase().includes(q),
    )
  }, [fields, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 text-sm"
        >
          {selectedField ? (
            <span className="truncate">
              {selectedField.name}
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({FIELD_TYPE_LABELS[selectedField.field_type] || selectedField.field_type})
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Не привязано</span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Поиск поля..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-[480px] overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={cn(
              'relative flex w-full cursor-pointer items-center rounded-sm py-1 px-2 text-sm hover:bg-accent',
              !value && 'bg-accent',
            )}
            onClick={() => {
              onChange(null)
              setOpen(false)
              setSearch('')
            }}
          >
            <span className="text-muted-foreground">Не привязано</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
          </button>

          {filtered.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">Ничего не найдено</div>
          ) : (
            filtered.map((field) => (
              <button
                key={field.id}
                type="button"
                className={cn(
                  'relative flex w-full cursor-pointer items-center rounded-sm py-1 px-2 text-sm hover:bg-accent',
                  value === field.id && 'bg-accent',
                )}
                onClick={() => {
                  onChange(field.id)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <span className="truncate">{field.name}</span>
                <span className="text-muted-foreground ml-1.5 text-xs shrink-0">
                  ({FIELD_TYPE_LABELS[field.field_type] || field.field_type})
                </span>
                {value === field.id && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function PlaceholderMappingDialog({
  template,
  workspaceId: _workspaceId,
  open,
  onOpenChange,
}: PlaceholderMappingDialogProps) {
  const updateMutation = useUpdateDocumentTemplate()

  const placeholders = (template.placeholders || []) as DocumentTemplatePlaceholder[]
  const [mapping, setMapping] = useState<Record<string, string | null>>(() => {
    const initial: Record<string, string | null> = {}
    for (const ph of placeholders) {
      initial[ph.name] = ph.field_definition_id
    }
    return initial
  })

  // Load field_definitions (глобальная таблица, без workspace_id)
  const { data: fields = [] } = useQuery({
    queryKey: fieldDefinitionKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definitions')
        .select('id, name, field_type')
        .order('name', { ascending: true })

      if (error) throw error
      return data as FieldDefinition[]
    },
    enabled: open,
  })

  const handleSave = async () => {
    const updatedPlaceholders: DocumentTemplatePlaceholder[] = placeholders.map((ph) => ({
      ...ph,
      field_definition_id: mapping[ph.name] || null,
    }))

    await updateMutation.mutateAsync({
      id: template.id,
      updates: { placeholders: updatedPlaceholders },
    })

    onOpenChange(false)
  }

  const mappedCount = Object.values(mapping).filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройка плейсхолдеров</DialogTitle>
          <DialogDescription>
            Привяжите каждый плейсхолдер из шаблона «{template.name}» к полю анкеты. При генерации
            документа плейсхолдеры будут заменены значениями полей.
          </DialogDescription>
        </DialogHeader>

        {placeholders.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            В этом шаблоне не найдено плейсхолдеров. Убедитесь, что в DOCX-файле есть метки вида{' '}
            {'{{имя_поля}}'}.
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="text-sm text-muted-foreground mb-2">
              Привязано: {mappedCount} из {placeholders.length}
            </div>

            {placeholders.map((ph) => (
              <div key={ph.name} className="flex items-center gap-4">
                <div className="w-1/3 font-mono text-xs bg-muted px-3 py-2 rounded">
                  {`{{${ph.name}}}`}
                </div>
                <div className="w-2/3">
                  <FieldCombobox
                    fields={fields}
                    value={mapping[ph.name] || null}
                    onChange={(fieldId) => {
                      setMapping((prev) => ({
                        ...prev,
                        [ph.name]: fieldId,
                      }))
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
