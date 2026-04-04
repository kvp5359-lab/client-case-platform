/**
 * Диалог создания/редактирования поля справочника
 */

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useCustomDirectories } from '@/hooks/custom-directories'
import { FIELD_TYPE_LABELS } from '@/types/customDirectories'
import type {
  CustomDirectoryField,
  CustomDirectoryFieldType,
  DirectoryFieldOptions,
} from '@/types/customDirectories'

const FIELD_TYPES = Object.entries(FIELD_TYPE_LABELS) as [CustomDirectoryFieldType, string][]

interface FieldFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: CustomDirectoryField | null
  onSave: (data: {
    name: string
    field_type: CustomDirectoryFieldType
    is_primary: boolean
    is_required: boolean
    is_unique: boolean
    is_visible_in_list: boolean
    options: DirectoryFieldOptions
  }) => void
  hasPrimaryField: boolean
  directoryId: string
}

export function FieldFormDialog({
  open,
  onOpenChange,
  editing,
  onSave,
  hasPrimaryField,
  directoryId,
}: FieldFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <FieldFormBody
            key={editing?.id ?? 'create'}
            editing={editing}
            onSave={onSave}
            hasPrimaryField={hasPrimaryField}
            directoryId={directoryId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function FieldFormBody({
  editing,
  onSave,
  hasPrimaryField,
  directoryId,
  onClose,
}: {
  editing: CustomDirectoryField | null
  onSave: FieldFormDialogProps['onSave']
  hasPrimaryField: boolean
  directoryId: string
  onClose: () => void
}) {
  const editOpts = editing?.options as DirectoryFieldOptions | undefined

  const [name, setName] = useState(editing?.name ?? '')
  const [fieldType, setFieldType] = useState<CustomDirectoryFieldType>(
    editing?.field_type ?? 'text',
  )
  const [isPrimary, setIsPrimary] = useState(editing?.is_primary ?? !hasPrimaryField)
  const [isRequired, setIsRequired] = useState(editing?.is_required ?? false)
  const [isUnique, setIsUnique] = useState(editing?.is_unique ?? false)
  const [isVisibleInList, setIsVisibleInList] = useState(editing?.is_visible_in_list ?? true)
  const [choices, setChoices] = useState<string[]>(editOpts?.choices ?? [])
  const [newChoice, setNewChoice] = useState('')
  const [refDirectoryId, setRefDirectoryId] = useState(editOpts?.ref_directory_id ?? '')

  const { directories } = useCustomDirectories()
  // Фильтруем текущий справочник из списка ссылок
  const availableDirectories = directories.filter((d) => d.id !== directoryId)

  const handleSave = () => {
    if (!name.trim()) return

    const options: DirectoryFieldOptions = {}
    if (fieldType === 'select' || fieldType === 'multi_select') {
      options.choices = choices
    }
    if (fieldType === 'directory_ref') {
      options.ref_directory_id = refDirectoryId
    }

    onSave({
      name: name.trim(),
      field_type: fieldType,
      is_primary: isPrimary,
      is_required: isRequired,
      is_unique: isUnique,
      is_visible_in_list: isVisibleInList,
      options,
    })
  }

  const addChoice = () => {
    const val = newChoice.trim()
    if (!val || choices.includes(val)) return
    setChoices([...choices, val])
    setNewChoice('')
  }

  const removeChoice = (index: number) => {
    setChoices(choices.filter((_, i) => i !== index))
  }

  const showChoicesEditor = fieldType === 'select' || fieldType === 'multi_select'
  const showRefSelector = fieldType === 'directory_ref'
  // Первичное поле должно быть текстового типа
  const canBePrimary = fieldType === 'text' || fieldType === 'number'

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? 'Редактировать поле' : 'Новое поле'}</DialogTitle>
        <DialogDescription>
          {editing ? 'Измените параметры поля' : 'Добавьте новое поле в справочник'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
        {/* Название */}
        <div className="space-y-2">
          <Label htmlFor="field-name">Название *</Label>
          <Input
            id="field-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: ФИО"
            autoFocus
          />
        </div>

        {/* Тип поля */}
        <div className="space-y-2">
          <Label>Тип поля *</Label>
          <Select
            value={fieldType}
            onValueChange={(v) => setFieldType(v as CustomDirectoryFieldType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Варианты для select / multi_select */}
        {showChoicesEditor && (
          <div className="space-y-2">
            <Label>Варианты</Label>
            <div className="space-y-1">
              {choices.map((choice, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1 text-sm"
                >
                  <span className="flex-1">{choice}</span>
                  <button
                    type="button"
                    onClick={() => removeChoice(i)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newChoice}
                onChange={(e) => setNewChoice(e.target.value)}
                placeholder="Новый вариант"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addChoice())}
                className="text-sm"
              />
              <Button type="button" variant="outline" size="sm" onClick={addChoice}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Ссылка на справочник */}
        {showRefSelector && (
          <div className="space-y-2">
            <Label>Справочник-источник</Label>
            {availableDirectories.length === 0 ? (
              <p className="text-sm text-gray-500">Нет других справочников для ссылки</p>
            ) : (
              <Select value={refDirectoryId} onValueChange={setRefDirectoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Выберите справочник" />
                </SelectTrigger>
                <SelectContent>
                  {availableDirectories.map((dir) => (
                    <SelectItem key={dir.id} value={dir.id}>
                      {dir.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Чекбоксы */}
        <div className="space-y-3 pt-2 border-t">
          {canBePrimary && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="is-primary"
                checked={isPrimary}
                onCheckedChange={(v) => setIsPrimary(v === true)}
                disabled={hasPrimaryField && !editing?.is_primary}
              />
              <Label htmlFor="is-primary" className="text-sm font-normal cursor-pointer">
                Первичное поле (используется как название записи)
              </Label>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="is-required"
              checked={isRequired}
              onCheckedChange={(v) => setIsRequired(v === true)}
            />
            <Label htmlFor="is-required" className="text-sm font-normal cursor-pointer">
              Обязательное
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is-unique"
              checked={isUnique}
              onCheckedChange={(v) => setIsUnique(v === true)}
            />
            <Label htmlFor="is-unique" className="text-sm font-normal cursor-pointer">
              Уникальное значение
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is-visible"
              checked={isVisibleInList}
              onCheckedChange={(v) => setIsVisibleInList(v === true)}
            />
            <Label htmlFor="is-visible" className="text-sm font-normal cursor-pointer">
              Показывать в таблице записей
            </Label>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Отмена
        </Button>
        <Button onClick={handleSave} disabled={!name.trim()}>
          {editing ? 'Сохранить' : 'Добавить'}
        </Button>
      </DialogFooter>
    </>
  )
}
