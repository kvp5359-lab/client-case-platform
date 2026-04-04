/**
 * Диалог редактирования поля
 */

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Trash2 } from 'lucide-react'
import { FormFieldWithDefinition, FormSectionWithDetails, getFieldTypeLabel } from '../types'
import type { FieldOptions } from '@/types/formKit'
import { fromSupabaseJson } from '@/utils/supabaseJson'

const HEADER_COLOR_PRESETS = [
  { value: '', label: 'По умолчанию', color: 'hsl(var(--muted))' },
  { value: '#e2e8f0', label: 'Серый', color: '#e2e8f0' },
  { value: '#dbeafe', label: 'Голубой', color: '#dbeafe' },
  { value: '#dcfce7', label: 'Зелёный', color: '#dcfce7' },
  { value: '#fef9c3', label: 'Жёлтый', color: '#fef9c3' },
  { value: '#fce7f3', label: 'Розовый', color: '#fce7f3' },
  { value: '#f3e8ff', label: 'Фиолетовый', color: '#f3e8ff' },
  { value: '#ffedd5', label: 'Оранжевый', color: '#ffedd5' },
]

export interface EditFieldState {
  sectionId: string
  isRequired: boolean
  description: string
  defaultRows: string[][]
  headerColor: string
  activeTab: string
  dividerName: string
}

export interface EditFieldHandlers {
  onSectionIdChange: (value: string) => void
  onIsRequiredChange: (value: boolean) => void
  onDescriptionChange: (value: string) => void
  onDividerNameChange: (value: string) => void
  onDefaultRowsChange: (rows: string[][]) => void
  onHeaderColorChange: (color: string) => void
  onActiveTabChange: (tab: string) => void
  onSave: () => void
  onClose: () => void
}

interface EditFieldDialogProps {
  field: FormFieldWithDefinition | null
  sections: FormSectionWithDetails[]
  isUpdating: boolean
  state: EditFieldState
  handlers: EditFieldHandlers
}

export function EditFieldDialog({
  field,
  sections,
  isUpdating,
  state,
  handlers,
}: EditFieldDialogProps) {
  const { sectionId, isRequired, description, defaultRows, headerColor, activeTab, dividerName } =
    state
  const {
    onSectionIdChange,
    onIsRequiredChange,
    onDescriptionChange,
    onDividerNameChange,
    onDefaultRowsChange,
    onHeaderColorChange,
    onActiveTabChange,
    onSave,
    onClose,
  } = handlers
  if (!field) return null

  const isKeyValueTable = field.field_definition.field_type === 'key-value-table'
  const columns = fromSupabaseJson<FieldOptions | null>(field.field_definition.options)
    ?.columns || [
    { name: 'Ключ', type: 'text' },
    { name: 'Значение', type: 'text' },
  ]

  const handleAddRow = () => {
    const newRow = new Array(columns.length).fill('')
    onDefaultRowsChange([...defaultRows, newRow])
  }

  const handleRemoveRow = (rowIndex: number) => {
    onDefaultRowsChange(defaultRows.filter((_, i) => i !== rowIndex))
  }

  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const newRows = [...defaultRows]
    if (!newRows[rowIndex]) {
      newRows[rowIndex] = new Array(columns.length).fill('')
    }
    newRows[rowIndex] = [...newRows[rowIndex]]
    newRows[rowIndex][colIndex] = value
    onDefaultRowsChange(newRows)
  }

  // Рендерим JSX напрямую, без создания компонентов внутри render

  const isDivider = field.field_definition.field_type === 'divider'

  const fieldSettingsContent = (
    <div className="space-y-4">
      {/* Название разделителя */}
      {isDivider && (
        <div className="space-y-2">
          <Label htmlFor="edit-divider-name">Название разделителя</Label>
          <Input
            id="edit-divider-name"
            value={dividerName}
            onChange={(e) => onDividerNameChange(e.target.value)}
            placeholder="Заголовок подгруппы"
          />
        </div>
      )}

      {/* Описание поля */}
      {!isDivider && (
        <div className="space-y-2">
          <Label htmlFor="edit-description">Описание поля</Label>
          <textarea
            id="edit-description"
            className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="Описание, которое будет показываться при нажатии на иконку вопроса"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Это описание можно изменить для данного шаблона анкеты. Оригинальное описание в
            справочнике полей останется без изменений.
          </p>
        </div>
      )}

      {/* Выбор секции */}
      <div className="space-y-2">
        <Label htmlFor="edit-section">Секция</Label>
        <Select value={sectionId} onValueChange={onSectionIdChange}>
          <SelectTrigger id="edit-section">
            <SelectValue placeholder="Без секции" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no-section">Без секции</SelectItem>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Чекбокс обязательности (не для разделителей) */}
      {field?.field_definition?.field_type !== 'divider' && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="edit-required"
            checked={isRequired}
            onCheckedChange={(checked) => onIsRequiredChange(checked as boolean)}
          />
          <Label htmlFor="edit-required" className="cursor-pointer">
            Обязательное поле
          </Label>
        </div>
      )}

      {/* Цвет шапки таблицы — только для key-value-table */}
      {isKeyValueTable && (
        <div className="space-y-2">
          <Label>Цвет шапки таблицы</Label>
          <div className="flex flex-wrap gap-2">
            {HEADER_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  headerColor === preset.value
                    ? 'border-foreground scale-110'
                    : 'border-border hover:border-foreground/50'
                }`}
                style={{ backgroundColor: preset.color }}
                onClick={() => onHeaderColorChange(preset.value)}
                title={preset.label}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label
              htmlFor="edit-header-color-custom"
              className="text-xs text-muted-foreground shrink-0"
            >
              Свой цвет:
            </Label>
            <input
              id="edit-header-color-custom"
              type="color"
              value={headerColor || '#f4f4f5'}
              onChange={(e) => onHeaderColorChange(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border"
            />
            {headerColor && (
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground underline"
                onClick={() => onHeaderColorChange('')}
              >
                Сбросить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )

  const defaultRowsTableContent = (
    <div className="space-y-4">
      {/* Описание и кнопка добавления */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground flex-1 mr-4">
          Эти строки будут автоматически добавлены в таблицу при создании новой анкеты проекта.
          Пользователи смогут редактировать и удалять их.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          className="bg-brand-400 hover:bg-brand-500 text-black border-brand-400 shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Добавить строку
        </Button>
      </div>

      {/* Таблица */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b bg-muted/30">
              {columns.map((column, index) => (
                <th
                  key={index}
                  className="py-2 px-3 text-left text-xs font-semibold text-muted-foreground"
                >
                  {column.name}
                </th>
              ))}
              <th className="py-2 px-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {defaultRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  Нет строк по умолчанию
                </td>
              </tr>
            ) : (
              defaultRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="group border-b hover:bg-muted/20 transition-colors">
                  {columns.map((column, colIndex) => (
                    <td key={colIndex} className="py-1 px-3">
                      <Input
                        type={
                          column.type === 'number'
                            ? 'number'
                            : column.type === 'date'
                              ? 'date'
                              : 'text'
                        }
                        value={row[colIndex] || ''}
                        onChange={(e) => handleCellChange(rowIndex, colIndex, e.target.value)}
                        placeholder="—"
                        className="h-8 text-sm border-0 bg-transparent p-0 focus:outline-none focus:ring-0"
                      />
                    </td>
                  ))}
                  <td className="py-1 px-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveRow(rowIndex)}
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Удалить строку"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <Dialog open={!!field} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={isKeyValueTable ? 'max-w-2xl' : 'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{field.field_definition.name}</DialogTitle>
          <DialogDescription>
            Тип поля: {getFieldTypeLabel(field.field_definition.field_type)}
          </DialogDescription>
        </DialogHeader>

        {isKeyValueTable ? (
          <Tabs value={activeTab} onValueChange={onActiveTabChange}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="default-rows">Строки по умолчанию</TabsTrigger>
              <TabsTrigger value="settings">Настройки</TabsTrigger>
            </TabsList>

            <TabsContent value="default-rows" className="mt-4">
              {defaultRowsTableContent}
            </TabsContent>

            <TabsContent value="settings" className="mt-4">
              {fieldSettingsContent}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="py-4">{fieldSettingsContent}</div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={onSave} disabled={isUpdating}>
            {isUpdating ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
