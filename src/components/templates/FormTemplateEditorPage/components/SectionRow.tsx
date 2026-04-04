/**
 * Строка секции в таблице с inline-редактированием
 * Использует FieldsTableContext для drag/drop и обработчиков (без prop drilling)
 */

import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { NativeTableRow, NativeTableCell } from '@/components/ui/native-table'
import { GripVertical, Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { FormSectionWithDetails, FormFieldWithDefinition } from '../types'
import { DraggableFieldRow } from './DraggableFieldRow'
import { useFieldsTableContext } from './FieldsTableContext'

interface SectionRowProps {
  section: FormSectionWithDetails
  sectionFields: FormFieldWithDefinition[]
  isCollapsed: boolean
  isSectionBeingDragged: boolean
  isSectionDropTarget: boolean
  sectionDragOverPosition: 'top' | 'bottom'
  isSectionDragOver: boolean
}

export function SectionRow({
  section,
  sectionFields,
  isCollapsed,
  isSectionBeingDragged,
  isSectionDropTarget,
  sectionDragOverPosition,
  isSectionDragOver,
}: SectionRowProps) {
  const ctx = useFieldsTableContext()

  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(section.name)
  const [editedDescription, setEditedDescription] = useState(section.description || '')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditing])

  const handleStartEditing = () => {
    setEditedName(section.name)
    setEditedDescription(section.description || '')
    setIsEditing(true)
  }

  const handleSave = () => {
    if (!editedName.trim()) return
    ctx.onUpdateSection(section.id, {
      name: editedName.trim(),
      description: editedDescription.trim(),
    })
    setIsEditing(false)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditedName(section.name)
    setEditedDescription(section.description || '')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <React.Fragment>
      {/* Заголовок секции */}
      <NativeTableRow
        isSection
        className={`group/section transition-colors ${
          isSectionBeingDragged
            ? 'opacity-40 bg-blue-50'
            : isSectionDropTarget
              ? sectionDragOverPosition === 'top'
                ? 'bg-blue-100 border-t-2 border-t-blue-500'
                : 'bg-blue-100 border-b-2 border-b-blue-500'
              : ''
        }`}
        draggable={!isEditing}
        onDragStart={(e) => ctx.onSectionDragStart(e, section.id)}
        onDragOver={(e) => ctx.onSectionDragOver(e, section.id)}
        onDragLeave={ctx.onSectionDragLeave}
        onDrop={(e) => ctx.onSectionDrop(e, section)}
        onDragEnd={ctx.onSectionDragEnd}
      >
        <NativeTableCell>
          <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
        </NativeTableCell>
        <NativeTableCell className="text-base font-semibold">
          <div className="flex items-center justify-between">
            {isEditing ? (
              <div className="flex items-center gap-2 flex-1">
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-2 py-1 text-base font-semibold border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                  onClick={handleSave}
                >
                  <Check className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={handleCancel}>
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <span
                  className="cursor-pointer hover:text-primary"
                  onDoubleClick={handleStartEditing}
                >
                  {section.name}{' '}
                  <span className="text-muted-foreground font-normal">
                    ({sectionFields.length})
                  </span>
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover/section:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs"
                    onClick={() => ctx.onAddField(section.id)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    добавить поле
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={handleStartEditing}
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => ctx.onRemoveSection(section.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </NativeTableCell>
        <NativeTableCell className="text-base">
          {isEditing ? (
            <input
              type="text"
              value={editedDescription}
              onChange={(e) => setEditedDescription(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Описание секции"
              className="w-full px-2 py-1 text-base border rounded bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          ) : (
            section.description || '—'
          )}
        </NativeTableCell>
      </NativeTableRow>

      {/* Поля секции */}
      {!isCollapsed &&
        sectionFields.length > 0 &&
        sectionFields.map((field) => {
          const isDivider = field.field_definition.field_type === 'divider'
          const fieldIndex = isDivider
            ? undefined
            : sectionFields
                .filter((f) => f.field_definition.field_type !== 'divider')
                .indexOf(field) + 1
          return (
            <DraggableFieldRow
              key={field.id}
              field={field}
              index={fieldIndex}
              isDragging={ctx.draggedFieldId === field.id}
              isOver={ctx.dragOverFieldId === field.id}
              overPosition={ctx.dragOverPosition}
              onDragStart={ctx.onFieldDragStart}
              onDragOver={ctx.onFieldDragOver}
              onDragLeave={ctx.onFieldDragLeave}
              onDrop={ctx.onFieldDrop}
              onDragEnd={ctx.onFieldDragEnd}
              onEdit={ctx.onFieldEdit}
              onRemove={ctx.onFieldRemove}
            />
          )
        })}

      {/* Зона drop для пустой секции */}
      {!isCollapsed && sectionFields.length === 0 && (
        <NativeTableRow
          className={`transition-colors ${
            isSectionDragOver
              ? 'bg-blue-100 border-2 border-blue-500 border-dashed'
              : 'bg-muted/20 border-2 border-dashed border-transparent hover:border-muted'
          }`}
          onDragOver={(e) => ctx.onEmptySectionDragOver(e, section.id)}
          onDragLeave={ctx.onEmptySectionDragLeave}
          onDrop={(e) => ctx.onEmptySectionDrop(e, section.id)}
        >
          <NativeTableCell colSpan={3} className="text-center py-8 text-muted-foreground text-sm">
            {ctx.draggedFieldId
              ? '↓ Перетащите поле сюда'
              : 'Секция пуста — добавьте поле или перетащите сюда'}
          </NativeTableCell>
        </NativeTableRow>
      )}
    </React.Fragment>
  )
}
