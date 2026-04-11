/**
 * Контекст состояния для FormTemplateEditorPage
 */

import React, { createContext, useContext, useReducer, useMemo, ReactNode } from 'react'
import { FormFieldWithDefinition, FormSectionWithDetails } from '../types'
import type { TemplateFieldOptions } from '@/types/formKit'

// Состояние
interface FormTemplateState {
  // Редактирование названия
  isEditingName: boolean
  editedName: string
  editedDescription: string
  editedAiExtractionPrompt: string

  // Диалоги
  isCreateSectionDialogOpen: boolean
  isAddFieldDialogOpen: boolean
  selectedFieldIds: string[]
  fieldSearchQuery: string
  targetSectionId: string | null

  // Редактирование поля
  editingField: FormFieldWithDefinition | null
  editFieldSectionId: string
  editFieldIsRequired: boolean
  editFieldDescription: string
  editFieldDefaultRows: string[][]
  editFieldHeaderColor: string
  editFieldActiveTab: string
  editFieldDividerName: string

  // UI состояния
  collapsedSections: Set<string>

  // Drag & Drop полей
  draggedFieldId: string | null
  dragOverFieldId: string | null
  dragOverPosition: 'top' | 'bottom'
  dragOverSectionId: string | null

  // Drag & Drop секций
  draggedSectionFormId: string | null
  dragOverSectionFormId: string | null
  sectionDragOverPosition: 'top' | 'bottom'
}

// Действия
type FormTemplateAction =
  | { type: 'SET_EDITING_NAME'; payload: boolean }
  | { type: 'SET_EDITED_NAME'; payload: string }
  | { type: 'SET_EDITED_DESCRIPTION'; payload: string }
  | { type: 'SET_EDITED_AI_EXTRACTION_PROMPT'; payload: string }
  | {
      type: 'INIT_EDIT_FORM'
      payload: { name: string; description: string; aiExtractionPrompt: string }
    }
  | { type: 'OPEN_CREATE_SECTION_DIALOG' }
  | { type: 'CLOSE_CREATE_SECTION_DIALOG' }
  | { type: 'OPEN_ADD_FIELD_DIALOG'; payload: string | null }
  | { type: 'CLOSE_ADD_FIELD_DIALOG' }
  | { type: 'SET_FIELD_SEARCH_QUERY'; payload: string }
  | { type: 'TOGGLE_FIELD_SELECTION'; payload: string }
  | { type: 'CLEAR_FIELD_SELECTION' }
  | {
      type: 'OPEN_EDIT_FIELD_DIALOG'
      payload: { field: FormFieldWithDefinition; sections: FormSectionWithDetails[] }
    }
  | { type: 'CLOSE_EDIT_FIELD_DIALOG' }
  | { type: 'SET_EDIT_FIELD_SECTION_ID'; payload: string }
  | { type: 'SET_EDIT_FIELD_IS_REQUIRED'; payload: boolean }
  | { type: 'SET_EDIT_FIELD_DESCRIPTION'; payload: string }
  | { type: 'SET_EDIT_FIELD_DEFAULT_ROWS'; payload: string[][] }
  | { type: 'SET_EDIT_FIELD_HEADER_COLOR'; payload: string }
  | { type: 'SET_EDIT_FIELD_ACTIVE_TAB'; payload: string }
  | { type: 'SET_EDIT_FIELD_DIVIDER_NAME'; payload: string }
  | { type: 'TOGGLE_SECTION_COLLAPSE'; payload: string }
  | { type: 'SET_DRAGGED_FIELD_ID'; payload: string | null }
  | { type: 'SET_DRAG_OVER_FIELD'; payload: { fieldId: string | null; position: 'top' | 'bottom' } }
  | { type: 'SET_DRAG_OVER_SECTION_ID'; payload: string | null }
  | { type: 'RESET_FIELD_DRAG_STATE' }
  | { type: 'SET_DRAGGED_SECTION_FORM_ID'; payload: string | null }
  | {
      type: 'SET_DRAG_OVER_SECTION_FORM'
      payload: { sectionFormId: string | null; position: 'top' | 'bottom' }
    }
  | { type: 'RESET_SECTION_DRAG_STATE' }

// Начальное состояние
const initialState: FormTemplateState = {
  isEditingName: false,
  editedName: '',
  editedDescription: '',
  editedAiExtractionPrompt: '',
  isCreateSectionDialogOpen: false,
  isAddFieldDialogOpen: false,
  selectedFieldIds: [],
  fieldSearchQuery: '',
  targetSectionId: null,
  editingField: null,
  editFieldSectionId: '',
  editFieldIsRequired: false,
  editFieldDescription: '',
  editFieldDefaultRows: [],
  editFieldHeaderColor: '',
  editFieldActiveTab: 'settings',
  editFieldDividerName: '',
  collapsedSections: new Set(),
  draggedFieldId: null,
  dragOverFieldId: null,
  dragOverPosition: 'top',
  dragOverSectionId: null,
  draggedSectionFormId: null,
  dragOverSectionFormId: null,
  sectionDragOverPosition: 'top',
}

// Редьюсер
function formTemplateReducer(
  state: FormTemplateState,
  action: FormTemplateAction,
): FormTemplateState {
  switch (action.type) {
    case 'SET_EDITING_NAME':
      return { ...state, isEditingName: action.payload }
    case 'SET_EDITED_NAME':
      return { ...state, editedName: action.payload }
    case 'SET_EDITED_DESCRIPTION':
      return { ...state, editedDescription: action.payload }
    case 'SET_EDITED_AI_EXTRACTION_PROMPT':
      return { ...state, editedAiExtractionPrompt: action.payload }
    case 'INIT_EDIT_FORM':
      return {
        ...state,
        editedName: action.payload.name,
        editedDescription: action.payload.description,
        editedAiExtractionPrompt: action.payload.aiExtractionPrompt,
      }
    case 'OPEN_CREATE_SECTION_DIALOG':
      return { ...state, isCreateSectionDialogOpen: true }
    case 'CLOSE_CREATE_SECTION_DIALOG':
      return { ...state, isCreateSectionDialogOpen: false }
    case 'OPEN_ADD_FIELD_DIALOG':
      return { ...state, isAddFieldDialogOpen: true, targetSectionId: action.payload }
    case 'CLOSE_ADD_FIELD_DIALOG':
      return {
        ...state,
        isAddFieldDialogOpen: false,
        selectedFieldIds: [],
        fieldSearchQuery: '',
        targetSectionId: null,
      }
    case 'SET_FIELD_SEARCH_QUERY':
      return { ...state, fieldSearchQuery: action.payload }
    case 'TOGGLE_FIELD_SELECTION':
      return {
        ...state,
        selectedFieldIds: state.selectedFieldIds.includes(action.payload)
          ? state.selectedFieldIds.filter((id) => id !== action.payload)
          : [...state.selectedFieldIds, action.payload],
      }
    case 'CLEAR_FIELD_SELECTION':
      return { ...state, selectedFieldIds: [] }
    case 'OPEN_EDIT_FIELD_DIALOG': {
      const { field } = action.payload
      const isKeyValueTable = field.field_definition.field_type === 'key-value-table'
      const fieldOptions = field.options as TemplateFieldOptions | null

      return {
        ...state,
        editingField: field,
        editFieldSectionId: field.form_template_section_id || 'no-section',
        editFieldIsRequired: field.is_required || false,
        editFieldDescription: field.description || '',
        editFieldDefaultRows: isKeyValueTable ? fieldOptions?.defaultRows || [] : [],
        editFieldHeaderColor: isKeyValueTable ? fieldOptions?.headerColor || '' : '',
        editFieldActiveTab: isKeyValueTable ? 'default-rows' : 'settings',
        editFieldDividerName:
          field.field_definition.field_type === 'divider' ? field.field_definition.name : '',
      }
    }
    case 'CLOSE_EDIT_FIELD_DIALOG':
      return {
        ...state,
        editingField: null,
        editFieldSectionId: '',
        editFieldIsRequired: false,
        editFieldDescription: '',
        editFieldDefaultRows: [],
        editFieldHeaderColor: '',
        editFieldActiveTab: 'settings',
        editFieldDividerName: '',
      }
    case 'SET_EDIT_FIELD_SECTION_ID':
      return { ...state, editFieldSectionId: action.payload }
    case 'SET_EDIT_FIELD_IS_REQUIRED':
      return { ...state, editFieldIsRequired: action.payload }
    case 'SET_EDIT_FIELD_DESCRIPTION':
      return { ...state, editFieldDescription: action.payload }
    case 'SET_EDIT_FIELD_DEFAULT_ROWS':
      return { ...state, editFieldDefaultRows: action.payload }
    case 'SET_EDIT_FIELD_HEADER_COLOR':
      return { ...state, editFieldHeaderColor: action.payload }
    case 'SET_EDIT_FIELD_ACTIVE_TAB':
      return { ...state, editFieldActiveTab: action.payload }
    case 'SET_EDIT_FIELD_DIVIDER_NAME':
      return { ...state, editFieldDividerName: action.payload }
    case 'TOGGLE_SECTION_COLLAPSE': {
      const next = new Set(state.collapsedSections)
      if (next.has(action.payload)) {
        next.delete(action.payload)
      } else {
        next.add(action.payload)
      }
      return { ...state, collapsedSections: next }
    }
    case 'SET_DRAGGED_FIELD_ID':
      return { ...state, draggedFieldId: action.payload }
    case 'SET_DRAG_OVER_FIELD':
      return {
        ...state,
        dragOverFieldId: action.payload.fieldId,
        dragOverPosition: action.payload.position,
      }
    case 'SET_DRAG_OVER_SECTION_ID':
      return { ...state, dragOverSectionId: action.payload }
    case 'RESET_FIELD_DRAG_STATE':
      return {
        ...state,
        draggedFieldId: null,
        dragOverFieldId: null,
        dragOverSectionId: null,
      }
    case 'SET_DRAGGED_SECTION_FORM_ID':
      return { ...state, draggedSectionFormId: action.payload }
    case 'SET_DRAG_OVER_SECTION_FORM':
      return {
        ...state,
        dragOverSectionFormId: action.payload.sectionFormId,
        sectionDragOverPosition: action.payload.position,
      }
    case 'RESET_SECTION_DRAG_STATE':
      return {
        ...state,
        draggedSectionFormId: null,
        dragOverSectionFormId: null,
      }
    default:
      return state
  }
}

// Контекст
interface FormTemplateContextValue {
  state: FormTemplateState
  dispatch: React.Dispatch<FormTemplateAction>
}

const FormTemplateContext = createContext<FormTemplateContextValue | null>(null)

// Провайдер
export function FormTemplateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(formTemplateReducer, initialState)

  // мемоизируем value чтобы потребители не перерендеривались лишний раз
  const value = useMemo(() => ({ state, dispatch }), [state])

  return <FormTemplateContext.Provider value={value}>{children}</FormTemplateContext.Provider>
}

// Хук для использования контекста
export function useFormTemplateContext() {
  const context = useContext(FormTemplateContext)
  if (!context) {
    throw new Error('useFormTemplateContext must be used within FormTemplateProvider')
  }
  return context
}
