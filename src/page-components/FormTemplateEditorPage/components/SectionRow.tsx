/**
 * Строка секции в таблице.
 * Редактирование (имя/описание/цвет) открывается в SectionSettingsDialog.
 */

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { NativeTableRow, NativeTableCell } from '@/components/ui/native-table'
import { GripVertical, Plus, Pencil, Trash2 } from 'lucide-react'
import { FormSectionWithDetails, FormFieldWithDefinition } from '../types'
import { DraggableFieldRow } from './DraggableFieldRow'
import { useFieldsTableContext } from './FieldsTableContext'
import { SectionSettingsDialog } from './SectionSettingsDialog'

type SectionRowProps = {
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
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleSave = (data: { name: string; description: string; headerColor: string | null }) => {
    ctx.onUpdateSection(section.id, { name: data.name, description: data.description })
    ctx.onUpdateSectionColor(section.id, data.headerColor)
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
        draggable
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
            <span
              className="cursor-pointer hover:text-primary"
              onDoubleClick={() => setIsDialogOpen(true)}
            >
              {section.name}{' '}
              <span className="text-muted-foreground font-normal">({sectionFields.length})</span>
            </span>
            <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover/section:opacity-100 transition-opacity">
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
                onClick={() => setIsDialogOpen(true)}
                title="Настройки секции"
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
          </div>
        </NativeTableCell>
        <NativeTableCell className="text-xs text-muted-foreground">
          <div className="truncate" title={section.description || ''}>
            {section.description || '—'}
          </div>
        </NativeTableCell>
      </NativeTableRow>

      <SectionSettingsDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        section={section}
        onSave={handleSave}
      />

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
