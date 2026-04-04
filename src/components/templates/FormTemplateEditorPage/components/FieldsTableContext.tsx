/**
 * Контекст для FieldsTable — drag/drop состояние и обработчики полей/секций
 * Убирает prop drilling между FieldsTable → SectionRow → DraggableFieldRow
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { FormSectionWithDetails, FormFieldWithDefinition } from '../types'

interface FieldsTableContextValue {
  // Field drag state
  draggedFieldId: string | null
  dragOverFieldId: string | null
  dragOverPosition: 'top' | 'bottom'
  // Field drag handlers
  onFieldDragStart: (e: React.DragEvent, fieldId: string) => void
  onFieldDragOver: (e: React.DragEvent, fieldId: string) => void
  onFieldDragLeave: () => void
  onFieldDrop: (e: React.DragEvent, field: FormFieldWithDefinition) => void
  onFieldDragEnd: () => void
  // Field actions
  onFieldEdit: (field: FormFieldWithDefinition) => void
  onFieldRemove: (fieldId: string) => void
  // Section drag handlers
  onSectionDragStart: (e: React.DragEvent, sectionId: string) => void
  onSectionDragOver: (e: React.DragEvent, sectionId: string) => void
  onSectionDragLeave: () => void
  onSectionDrop: (e: React.DragEvent, section: FormSectionWithDetails) => void
  onSectionDragEnd: () => void
  // Section actions
  onAddField: (sectionId: string) => void
  onUpdateSection: (sectionId: string, data: { name: string; description: string }) => void
  onRemoveSection: (sectionId: string) => void
  // Empty section drag
  onEmptySectionDragOver: (e: React.DragEvent, sectionId: string) => void
  onEmptySectionDragLeave: () => void
  onEmptySectionDrop: (e: React.DragEvent, sectionId: string) => void
}

const FieldsTableContext = createContext<FieldsTableContextValue | null>(null)

export function useFieldsTableContext() {
  const ctx = useContext(FieldsTableContext)
  if (!ctx) throw new Error('useFieldsTableContext must be used within FieldsTableProvider')
  return ctx
}

interface FieldsTableProviderProps extends FieldsTableContextValue {
  children: ReactNode
}

export function FieldsTableProvider({ children, ...value }: FieldsTableProviderProps) {
  const memoized = useMemo<FieldsTableContextValue>(
    () => value,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      value.draggedFieldId,
      value.dragOverFieldId,
      value.dragOverPosition,
      value.onFieldDragStart,
      value.onFieldDragOver,
      value.onFieldDragLeave,
      value.onFieldDrop,
      value.onFieldDragEnd,
      value.onFieldEdit,
      value.onFieldRemove,
      value.onSectionDragStart,
      value.onSectionDragOver,
      value.onSectionDragLeave,
      value.onSectionDrop,
      value.onSectionDragEnd,
      value.onAddField,
      value.onUpdateSection,
      value.onRemoveSection,
      value.onEmptySectionDragOver,
      value.onEmptySectionDragLeave,
      value.onEmptySectionDrop,
    ],
  )

  return <FieldsTableContext.Provider value={memoized}>{children}</FieldsTableContext.Provider>
}
