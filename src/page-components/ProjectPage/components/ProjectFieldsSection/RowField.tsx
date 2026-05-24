"use client"

/**
 * Рендер одного поля в карточке проекта (вкладка «Настройки»).
 * Тип поля решает, какой контрол: input/textarea/select/checkbox/...
 *
 * Сложные типы (composite, key-value-table, divider) показывают placeholder
 * — поддержка в карточке проекта пока не реализована.
 */

import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { FieldDefinition, FieldOptions } from '@/types/formKit'
import { fromSupabaseJson } from '@/utils/supabaseJson'

export type EntryRow = {
  id: string
  label: string
}

export type RowFieldProps = {
  field: FieldDefinition
  isRequired: boolean
  value: unknown
  onLocalChange: (v: unknown) => void
  onCommit: (v: unknown) => void
  disabled: boolean
  directoryEntries: EntryRow[]
}

export function RowField({
  field,
  isRequired,
  value,
  onLocalChange,
  onCommit,
  disabled,
  directoryEntries,
}: RowFieldProps) {
  const label = (
    <label className="font-medium text-muted-foreground pt-1.5">
      {field.name}
      {isRequired ? <span className="text-red-500 ml-0.5">*</span> : null}
    </label>
  )

  const input = (() => {
    switch (field.field_type) {
      case 'textarea':
        return (
          <Textarea
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onLocalChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
            rows={3}
          />
        )
      case 'number':
        return (
          <Input
            type="number"
            value={value === null || value === undefined ? '' : String(value)}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value === '' ? null : Number(e.target.value)
              onLocalChange(next)
              onCommit(next)
            }}
          />
        )
      case 'date':
        return (
          <Input
            type="date"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => {
              const next = e.target.value || null
              onLocalChange(next)
              onCommit(next)
            }}
          />
        )
      case 'checkbox':
        return (
          <Checkbox
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(v) => {
              const bool = v === true
              onLocalChange(bool)
              onCommit(bool)
            }}
          />
        )
      case 'email':
        return (
          <Input
            type="email"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onLocalChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
          />
        )
      case 'phone':
        return (
          <Input
            type="tel"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onLocalChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
          />
        )
      case 'url':
        return (
          <Input
            type="url"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onLocalChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
          />
        )
      case 'select': {
        const opts = fromSupabaseJson<FieldOptions | null>(field.options ?? null)
        const values = opts?.values ?? []
        const EMPTY = '__EMPTY__'
        return (
          <Select
            value={(value as string) || EMPTY}
            disabled={disabled}
            onValueChange={(v) => {
              const next = v === EMPTY ? null : v
              onLocalChange(next)
              onCommit(next)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="— Не выбрано —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY}>— Не выбрано —</SelectItem>
              {values.map((v) => (
                <SelectItem key={v} value={v}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
      case 'directory_ref': {
        const EMPTY = '__EMPTY__'
        return (
          <Select
            value={(value as string) || EMPTY}
            disabled={disabled}
            onValueChange={(v) => {
              const next = v === EMPTY ? null : v
              onLocalChange(next)
              onCommit(next)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="— Не выбрано —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={EMPTY}>— Не выбрано —</SelectItem>
              {directoryEntries.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
      case 'composite':
      case 'key-value-table':
      case 'divider':
        // Сложные типы пока не показываем в карточке проекта.
        return (
          <div className="text-xs text-muted-foreground italic">
            Тип «{field.field_type}» пока не поддерживается в карточке проекта
          </div>
        )
      case 'text':
      default:
        return (
          <Input
            type="text"
            value={(value as string) ?? ''}
            disabled={disabled}
            onChange={(e) => onLocalChange(e.target.value)}
            onBlur={(e) => onCommit(e.target.value)}
          />
        )
    }
  })()

  return (
    <>
      {label}
      <div>{input}</div>
    </>
  )
}
