/**
 * Диалог создания/редактирования записи справочника
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { extractValue } from '@/hooks/custom-directories'
import type {
  CustomDirectoryField,
  DirectoryEntryWithValues,
  DirectoryFieldOptions,
} from '@/types/customDirectories'

interface EntryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fields: CustomDirectoryField[]
  editing: DirectoryEntryWithValues | null
  onSave: (values: Record<string, unknown>) => void
  saving: boolean
}

export function EntryFormDialog({
  open,
  onOpenChange,
  fields,
  editing,
  onSave,
  saving,
}: EntryFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <EntryFormBody
            key={editing?.id ?? 'create'}
            fields={fields}
            editing={editing}
            onSave={onSave}
            saving={saving}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function buildInitialValues(
  fields: CustomDirectoryField[],
  editing: DirectoryEntryWithValues | null,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (editing) {
      const val = editing.values[field.id]
      result[field.id] = val
        ? extractValue(val, field.field_type)
        : field.field_type === 'checkbox'
          ? false
          : ''
    } else {
      result[field.id] = field.field_type === 'checkbox' ? false : ''
    }
  }
  return result
}

function EntryFormBody({
  fields,
  editing,
  onSave,
  saving,
  onClose,
}: {
  fields: CustomDirectoryField[]
  editing: DirectoryEntryWithValues | null
  onSave: (values: Record<string, unknown>) => void
  saving: boolean
  onClose: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    buildInitialValues(fields, editing),
  )

  const updateValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  const handleSave = () => {
    // Проверяем обязательные поля
    for (const field of fields) {
      if (field.is_required) {
        const val = values[field.id]
        if (val === undefined || val === null || val === '') {
          return
        }
      }
    }
    onSave(values)
  }

  const renderField = (field: CustomDirectoryField) => {
    const value = values[field.id]
    const opts = field.options as DirectoryFieldOptions
    const id = `entry-field-${field.id}`

    switch (field.field_type) {
      case 'text':
      case 'email':
      case 'phone':
      case 'url':
        return (
          <Input
            id={id}
            type={
              field.field_type === 'email' ? 'email' : field.field_type === 'url' ? 'url' : 'text'
            }
            value={(value as string) ?? ''}
            onChange={(e) => updateValue(field.id, e.target.value)}
            placeholder={opts?.placeholder || ''}
            disabled={saving}
          />
        )

      case 'textarea':
        return (
          <Textarea
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => updateValue(field.id, e.target.value)}
            placeholder={opts?.placeholder || ''}
            disabled={saving}
            rows={3}
          />
        )

      case 'number':
        return (
          <Input
            id={id}
            type="number"
            value={value !== null && value !== undefined ? String(value) : ''}
            onChange={(e) => updateValue(field.id, e.target.value ? Number(e.target.value) : '')}
            disabled={saving}
          />
        )

      case 'date':
        return (
          <Input
            id={id}
            type="date"
            value={value ? String(value).slice(0, 10) : ''}
            onChange={(e) => updateValue(field.id, e.target.value || '')}
            disabled={saving}
          />
        )

      case 'checkbox':
        return (
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id={id}
              checked={value === true}
              onCheckedChange={(v) => updateValue(field.id, v === true)}
              disabled={saving}
            />
            <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
              {field.name}
            </Label>
          </div>
        )

      case 'select':
        return (
          <Select
            value={(value as string) || ''}
            onValueChange={(v) => updateValue(field.id, v)}
            disabled={saving}
          >
            <SelectTrigger>
              <SelectValue placeholder="Выберите..." />
            </SelectTrigger>
            <SelectContent>
              {(opts?.choices ?? []).map((choice) => (
                <SelectItem key={choice} value={choice}>
                  {choice}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )

      case 'multi_select': {
        const selected = Array.isArray(value) ? (value as string[]) : []
        return (
          <div className="space-y-1">
            {(opts?.choices ?? []).map((choice) => (
              <div key={choice} className="flex items-center gap-2">
                <Checkbox
                  id={`${id}-${choice}`}
                  checked={selected.includes(choice)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      updateValue(field.id, [...selected, choice])
                    } else {
                      updateValue(
                        field.id,
                        selected.filter((s) => s !== choice),
                      )
                    }
                  }}
                  disabled={saving}
                />
                <Label htmlFor={`${id}-${choice}`} className="text-sm font-normal cursor-pointer">
                  {choice}
                </Label>
              </div>
            ))}
          </div>
        )
      }

      case 'directory_ref':
        // Для MVP: просто текстовое поле с UUID. Позже заменим на Combobox с поиском.
        return (
          <Input
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => updateValue(field.id, e.target.value)}
            placeholder="ID записи справочника"
            disabled={saving}
          />
        )

      default:
        return (
          <Input
            id={id}
            value={(value as string) ?? ''}
            onChange={(e) => updateValue(field.id, e.target.value)}
            disabled={saving}
          />
        )
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Редактировать запись' : 'Новая запись'}</DialogTitle>
        <DialogDescription>
          {editing ? 'Измените значения полей' : 'Заполните поля записи'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        {fields.map((field) => (
          <div key={field.id} className="space-y-2">
            {field.field_type !== 'checkbox' && (
              <Label htmlFor={`entry-field-${field.id}`}>
                {field.name}
                {field.is_required && ' *'}
              </Label>
            )}
            {renderField(field)}
          </div>
        ))}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Сохранение...' : editing ? 'Сохранить' : 'Добавить'}
        </Button>
      </DialogFooter>
    </>
  )
}
