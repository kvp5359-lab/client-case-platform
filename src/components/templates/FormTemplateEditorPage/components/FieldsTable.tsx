/**
 * Таблица полей анкеты
 * Обёртка с FieldsTableProvider для устранения prop drilling
 */

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { NativeTable, NativeTableBody } from '@/components/ui/native-table'
import { GripVertical, Pencil, Plus, FileText, Trash2 } from 'lucide-react'
import { FormSectionWithDetails, FormFieldWithDefinition } from '../types'
import { DraggableFieldRow } from './DraggableFieldRow'
import { SectionRow } from './SectionRow'
import { FieldsTableProvider, useFieldsTableContext } from './FieldsTableContext'

interface FieldsTableProps {
  sections: FormSectionWithDetails[]
  groupedFields: Record<string, FormFieldWithDefinition[]>
  collapsedSections: Set<string>
  // Field drag state
  draggedFieldId: string | null
  dragOverFieldId: string | null
  dragOverPosition: 'top' | 'bottom'
  dragOverSectionId: string | null
  // Section drag state
  draggedSectionFormId: string | null
  dragOverSectionFormId: string | null
  sectionDragOverPosition: 'top' | 'bottom'
  // Handlers
  onCreateSection: () => void
  onAddFields: (sectionId?: string | null) => void
  onRemoveSection: (sectionId: string) => void
  onFieldEdit: (field: FormFieldWithDefinition) => void
  onFieldRemove: (fieldId: string) => void
  // Field drag handlers
  onFieldDragStart: (e: React.DragEvent, fieldId: string) => void
  onFieldDragOver: (e: React.DragEvent, fieldId: string) => void
  onFieldDragLeave: () => void
  onFieldDrop: (e: React.DragEvent, field: FormFieldWithDefinition) => void
  onFieldDragEnd: () => void
  onEmptySectionDragOver: (e: React.DragEvent, sectionId: string) => void
  onEmptySectionDragLeave: () => void
  onEmptySectionDrop: (e: React.DragEvent, sectionId: string) => void
  // Section drag handlers
  onSectionDragStart: (e: React.DragEvent, sectionId: string) => void
  onSectionDragOver: (e: React.DragEvent, sectionId: string) => void
  onSectionDragLeave: () => void
  onUpdateSection: (sectionId: string, data: { name: string; description: string }) => void
  onSectionDrop: (e: React.DragEvent, section: FormSectionWithDetails) => void
  onSectionDragEnd: () => void
}

export function FieldsTable({
  sections,
  groupedFields,
  collapsedSections,
  draggedFieldId,
  dragOverFieldId,
  dragOverPosition,
  dragOverSectionId,
  draggedSectionFormId,
  dragOverSectionFormId,
  sectionDragOverPosition,
  onCreateSection,
  onAddFields,
  onUpdateSection,
  onRemoveSection,
  onFieldEdit,
  onFieldRemove,
  onFieldDragStart,
  onFieldDragOver,
  onFieldDragLeave,
  onFieldDrop,
  onFieldDragEnd,
  onEmptySectionDragOver,
  onEmptySectionDragLeave,
  onEmptySectionDrop,
  onSectionDragStart,
  onSectionDragOver,
  onSectionDragLeave,
  onSectionDrop,
  onSectionDragEnd,
}: FieldsTableProps) {
  const ungroupedFields = groupedFields['no-section'] || []
  const hasContent = sections.length > 0 || ungroupedFields.length > 0

  if (!hasContent) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="mb-4">В этом шаблоне пока нет полей и секций</p>
          <div className="flex gap-2 justify-center">
            <Button onClick={onCreateSection} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Добавить секцию
            </Button>
            <Button onClick={() => onAddFields(null)}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить поле
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <FieldsTableProvider
      draggedFieldId={draggedFieldId}
      dragOverFieldId={dragOverFieldId}
      dragOverPosition={dragOverPosition}
      onFieldDragStart={onFieldDragStart}
      onFieldDragOver={onFieldDragOver}
      onFieldDragLeave={onFieldDragLeave}
      onFieldDrop={onFieldDrop}
      onFieldDragEnd={onFieldDragEnd}
      onFieldEdit={onFieldEdit}
      onFieldRemove={onFieldRemove}
      onSectionDragStart={onSectionDragStart}
      onSectionDragOver={onSectionDragOver}
      onSectionDragLeave={onSectionDragLeave}
      onSectionDrop={onSectionDrop}
      onSectionDragEnd={onSectionDragEnd}
      onAddField={(sectionId) => onAddFields(sectionId)}
      onUpdateSection={onUpdateSection}
      onRemoveSection={onRemoveSection}
      onEmptySectionDragOver={onEmptySectionDragOver}
      onEmptySectionDragLeave={onEmptySectionDragLeave}
      onEmptySectionDrop={onEmptySectionDrop}
    >
      <FieldsTableContent
        sections={sections}
        groupedFields={groupedFields}
        collapsedSections={collapsedSections}
        ungroupedFields={ungroupedFields}
        dragOverSectionId={dragOverSectionId}
        draggedSectionFormId={draggedSectionFormId}
        dragOverSectionFormId={dragOverSectionFormId}
        sectionDragOverPosition={sectionDragOverPosition}
      />
    </FieldsTableProvider>
  )
}

interface FieldsTableContentProps {
  sections: FormSectionWithDetails[]
  groupedFields: Record<string, FormFieldWithDefinition[]>
  collapsedSections: Set<string>
  ungroupedFields: FormFieldWithDefinition[]
  dragOverSectionId: string | null
  draggedSectionFormId: string | null
  dragOverSectionFormId: string | null
  sectionDragOverPosition: 'top' | 'bottom'
}

/** Разбивает массив полей на сегменты по divider-ам */
function splitByDividers(fields: FormFieldWithDefinition[]) {
  const segments: Array<{
    divider: FormFieldWithDefinition | null
    fields: FormFieldWithDefinition[]
  }> = []
  let current: FormFieldWithDefinition[] = []

  for (const field of fields) {
    if (field.field_definition.field_type === 'divider') {
      segments.push({ divider: null, fields: current })
      current = []
      segments.push({ divider: field, fields: [] })
    } else {
      current.push(field)
    }
  }
  if (current.length > 0 || segments.length === 0) {
    segments.push({ divider: null, fields: current })
  }
  return segments
}

const TABLE_COLUMNS = [
  { key: 'grip', width: '40px' },
  { key: 'name', width: '60%' },
  { key: 'description', width: '40%' },
]

function DividerRow({
  field,
  ctx,
}: {
  field: FormFieldWithDefinition
  ctx: ReturnType<typeof useFieldsTableContext>
}) {
  return (
    <div
      className="group flex items-center justify-between px-3 py-1"
      draggable
      onDragStart={(e) => ctx.onFieldDragStart(e, field.id)}
      onDragOver={(e) => ctx.onFieldDragOver(e, field.id)}
      onDragLeave={ctx.onFieldDragLeave}
      onDrop={(e) => ctx.onFieldDrop(e, field)}
      onDragEnd={ctx.onFieldDragEnd}
    >
      <div className="flex items-center gap-2">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity cursor-move hover:bg-gray-200 p-1 rounded inline-flex">
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </div>
        <span className="text-sm font-medium text-gray-500">{field.field_definition.name}</span>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0"
          onClick={() => ctx.onFieldEdit(field)}
        >
          <Pencil className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => ctx.onFieldRemove(field.id)}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  )
}

function FieldsTableContent({
  sections,
  groupedFields,
  collapsedSections,
  ungroupedFields,
  dragOverSectionId,
  draggedSectionFormId,
  dragOverSectionFormId,
  sectionDragOverPosition,
}: FieldsTableContentProps) {
  const ctx = useFieldsTableContext()

  const segments = useMemo(() => splitByDividers(ungroupedFields), [ungroupedFields])

  // Счётчик для нумерации обычных полей (не divider)
  let fieldCounter = 0

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Ungrouped fields — разбиты по divider-ам */}
      {segments.map((segment, segIdx) => (
        <div key={segment.divider?.id ?? `seg-${segIdx}`}>
          {segment.divider && <DividerRow field={segment.divider} ctx={ctx} />}
          {segment.fields.length > 0 && (
            <NativeTable columns={TABLE_COLUMNS}>
              <NativeTableBody>
                {segment.fields.map((field) => {
                  fieldCounter++
                  return (
                    <DraggableFieldRow
                      key={field.id}
                      field={field}
                      index={fieldCounter}
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
              </NativeTableBody>
            </NativeTable>
          )}
        </div>
      ))}

      {/* Секции с полями */}
      <NativeTable columns={TABLE_COLUMNS}>
        <NativeTableBody>
          {sections.map((section) => {
            const sectionFields = (groupedFields[section.id] || []).sort(
              (a, b) => a.sort_order - b.sort_order,
            )
            const isCollapsed = collapsedSections.has(section.id)

            return (
              <SectionRow
                key={section.id}
                section={section}
                sectionFields={sectionFields}
                isCollapsed={isCollapsed}
                isSectionBeingDragged={draggedSectionFormId === section.id}
                isSectionDropTarget={dragOverSectionFormId === section.id}
                sectionDragOverPosition={sectionDragOverPosition}
                isSectionDragOver={dragOverSectionId === section.id}
              />
            )
          })}
        </NativeTableBody>
      </NativeTable>
    </div>
  )
}
