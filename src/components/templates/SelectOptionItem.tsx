/**
 * Строка одного значения выпадающего списка (SelectOptionsEditor)
 */

import React from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, GripVertical } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Database } from '@/types/database'

type SelectOption = Database['public']['Tables']['field_definition_select_options']['Row']

export const PRESET_COLORS = [
  '#6B7280', // Серый
  '#EF4444', // Красный
  '#F59E0B', // Оранжевый
  '#10B981', // Зелёный
  '#3B82F6', // Синий
  '#8B5CF6', // Фиолетовый
  '#EC4899', // Розовый
  '#14B8A6', // Бирюзовый
]

// --- ColorPickerPopover ---

interface ColorPickerPopoverProps {
  optionId: string
  currentColor: string | null
  onColorSelect: (id: string, color: string) => void
}

export function ColorPickerPopover({
  optionId,
  currentColor,
  onColorSelect,
}: ColorPickerPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-6 h-6 rounded border border-border hover:border-muted-foreground transition-colors flex-shrink-0"
          style={{ backgroundColor: currentColor || PRESET_COLORS[0] }}
          title="Изменить цвет"
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <div className="flex gap-1.5 flex-wrap max-w-[200px]">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onColorSelect(optionId, color)}
              className={`
                w-7 h-7 rounded border transition-all
                ${currentColor === color ? 'border-primary ring-2 ring-primary/20' : 'border-border'}
                hover:border-primary/50
              `}
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// --- OptionItem ---

interface OptionItemProps {
  option: SelectOption
  isEditing: boolean
  editingLabel: string
  isDragged: boolean
  isDragOver: boolean
  inputRef: React.RefObject<HTMLInputElement>
  onLabelChange: (val: string) => void
  onStartEdit: (option: SelectOption) => void
  onSaveEdit: (optionId: string) => void
  onKeyDown: (e: React.KeyboardEvent, optionId: string) => void
  onDragStart: (e: React.DragEvent, optionId: string) => void
  onDragOver: (e: React.DragEvent, optionId: string) => void
  onDragEnd: () => void
  onColorSelect: (id: string, color: string) => void
  onDelete: (optionId: string) => void
  isDeletePending: boolean
}

export function OptionItem({
  option,
  isEditing,
  editingLabel,
  isDragged,
  isDragOver,
  inputRef,
  onLabelChange,
  onStartEdit,
  onSaveEdit,
  onKeyDown,
  onDragStart,
  onDragOver,
  onDragEnd,
  onColorSelect,
  onDelete,
  isDeletePending,
}: OptionItemProps) {
  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => !isEditing && onDragStart(e, option.id)}
      onDragOver={(e) => !isEditing && onDragOver(e, option.id)}
      onDragEnd={onDragEnd}
      className={`
        flex items-center gap-2 p-2 rounded-md border bg-card
        transition-all duration-150
        ${isDragged ? 'opacity-50' : ''}
        ${isDragOver ? 'border-primary/50' : 'border-border'}
        ${!isEditing && 'hover:bg-accent/30 cursor-move'}
      `}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />

      <ColorPickerPopover
        optionId={option.id}
        currentColor={option.color}
        onColorSelect={onColorSelect}
      />

      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editingLabel}
          onChange={(e) => onLabelChange(e.target.value)}
          onBlur={() => onSaveEdit(option.id)}
          onKeyDown={(e) => onKeyDown(e, option.id)}
          className="flex-1 px-2 py-1 text-sm border-0 rounded-md bg-muted focus:outline-none focus:ring-0"
          placeholder="Введите значение..."
        />
      ) : (
        <div
          className="flex-1 min-w-0 px-2 py-1 text-sm cursor-text hover:bg-accent/50 rounded-md transition-colors"
          onClick={() => onStartEdit(option)}
        >
          {option.label || (
            <span className="text-muted-foreground italic">Введите значение...</span>
          )}
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onDelete(option.id)}
        disabled={isDeletePending}
        className="flex-shrink-0 h-7 w-7 p-0 hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
