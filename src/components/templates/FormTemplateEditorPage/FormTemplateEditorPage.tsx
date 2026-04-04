/**
 * FormTemplateEditorPage — страница редактирования шаблона анкеты
 *
 * Рефакторенная версия:
 * - Логика вынесена в хуки
 * - Состояние в контексте
 * - Компоненты разделены
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Minus, Plus } from 'lucide-react'

import { FormTemplateProvider, useFormTemplateContext } from './context/FormTemplateContext'
import { FormFieldWithDefinition } from './types'
import {
  useFormTemplate,
  useFormSections,
  useFormFields,
  useFieldDragDrop,
  useSectionDragDrop,
} from './hooks'
import { TemplateHeader, FieldsTable } from './components'
import { CreateSectionDialog, AddFieldsDialog, EditFieldDialog } from './dialogs'

function FormTemplateEditorContent() {
  const { workspaceId, templateId } = useParams<{ workspaceId: string; templateId: string }>()
  const router = useRouter()
  const { state, dispatch } = useFormTemplateContext()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Хуки данных
  const {
    template,
    isLoading: isTemplateLoading,
    updateTemplateAsync,
    isUpdating,
  } = useFormTemplate(templateId)
  const {
    sections,
    isLoading: isSectionsLoading,
    createSection,
    isCreatingSection,
    updateSection,
    removeSection,
  } = useFormSections(templateId)
  const {
    fields,
    isLoading: isFieldsLoading,
    fieldsToAdd,
    groupedFields,
    addFields,
    isAddingFields,
    addDivider,
    removeField,
    updateField,
    isUpdatingField,
  } = useFormFields(templateId)

  // Хуки drag & drop
  const fieldDragDrop = useFieldDragDrop(templateId, fields)
  const sectionDragDrop = useSectionDragDrop(templateId, sections)

  // Инициализация формы при загрузке шаблона
  useEffect(() => {
    if (template) {
      dispatch({
        type: 'INIT_EDIT_FORM',
        payload: {
          name: template.name,
          description: template.description || '',
          aiExtractionPrompt: template.ai_extraction_prompt || '',
        },
      })
    }
  }, [template, dispatch])

  // Обработчики
  const handleBack = () => {
    router.push(`/workspaces/${workspaceId}/settings/templates/form-templates`)
  }

  const handleStartEditing = () => {
    if (template) {
      dispatch({
        type: 'INIT_EDIT_FORM',
        payload: {
          name: template.name,
          description: template.description || '',
          aiExtractionPrompt: template.ai_extraction_prompt || '',
        },
      })
      dispatch({ type: 'SET_EDITING_NAME', payload: true })
    }
  }

  const handleCancelEditing = () => {
    dispatch({ type: 'SET_EDITING_NAME', payload: false })
    if (template) {
      dispatch({
        type: 'INIT_EDIT_FORM',
        payload: {
          name: template.name,
          description: template.description || '',
          aiExtractionPrompt: template.ai_extraction_prompt || '',
        },
      })
    }
  }

  const handleSaveEditing = async () => {
    if (!state.editedName.trim()) return
    try {
      await updateTemplateAsync({
        name: state.editedName,
        description: state.editedDescription,
        aiExtractionPrompt: state.editedAiExtractionPrompt,
      })
      dispatch({ type: 'SET_EDITING_NAME', payload: false })
    } catch {
      // Ошибка обработается React Query — данные формы сохраняются для повторной попытки
    }
  }

  const handleCreateSection = () => {
    dispatch({ type: 'OPEN_CREATE_SECTION_DIALOG' })
  }

  const handleSubmitCreateSection = (data: { name: string; description: string }) => {
    createSection(data)
    dispatch({ type: 'CLOSE_CREATE_SECTION_DIALOG' })
  }

  const handleRemoveSection = async (sectionId: string) => {
    const ok = await confirm({
      title: 'Удалить секцию?',
      description: 'Удалить эту секцию из шаблона?',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    removeSection(sectionId)
  }

  const handleAddFields = (sectionId: string | null = null) => {
    dispatch({ type: 'OPEN_ADD_FIELD_DIALOG', payload: sectionId })
  }

  const handleSubmitAddFields = () => {
    if (state.selectedFieldIds.length === 0) return
    addFields({ fieldIds: state.selectedFieldIds, targetSectionId: state.targetSectionId })
    dispatch({ type: 'CLOSE_ADD_FIELD_DIALOG' })
  }

  const handleRemoveField = async (fieldId: string) => {
    const ok = await confirm({
      title: 'Удалить поле?',
      description: 'Удалить это поле из шаблона?',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    removeField(fieldId)
  }

  const handleEditField = (field: FormFieldWithDefinition) => {
    dispatch({ type: 'OPEN_EDIT_FIELD_DIALOG', payload: { field, sections } })
  }

  const handleSaveEditField = () => {
    if (!state.editingField) return

    let options: Record<string, unknown> | undefined
    if (state.editingField.field_definition.field_type === 'key-value-table') {
      options = {
        defaultRows: state.editFieldDefaultRows,
        ...(state.editFieldHeaderColor ? { headerColor: state.editFieldHeaderColor } : {}),
      }
    }

    updateField({
      fieldId: state.editingField.id,
      isRequired: state.editFieldIsRequired,
      sectionId: state.editFieldSectionId === 'no-section' ? null : state.editFieldSectionId,
      description: state.editFieldDescription.trim() || null,
      options,
      dividerName:
        state.editingField.field_definition.field_type === 'divider'
          ? state.editFieldDividerName.trim() || 'Разделитель'
          : undefined,
    })
    dispatch({ type: 'CLOSE_EDIT_FIELD_DIALOG' })
  }

  const isLoading = isTemplateLoading || isSectionsLoading || isFieldsLoading

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Навигация */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Назад
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">Загрузка...</div>
          ) : !template ? (
            <div className="text-center py-12 text-muted-foreground">Шаблон не найден</div>
          ) : (
            <>
              {/* Заголовок шаблона */}
              <TemplateHeader
                template={template}
                isEditing={state.isEditingName}
                editedName={state.editedName}
                editedDescription={state.editedDescription}
                editedAiExtractionPrompt={state.editedAiExtractionPrompt}
                isUpdating={isUpdating}
                onEditedNameChange={(value) =>
                  dispatch({ type: 'SET_EDITED_NAME', payload: value })
                }
                onEditedDescriptionChange={(value) =>
                  dispatch({ type: 'SET_EDITED_DESCRIPTION', payload: value })
                }
                onEditedAiExtractionPromptChange={(value) =>
                  dispatch({ type: 'SET_EDITED_AI_EXTRACTION_PROMPT', payload: value })
                }
                onStartEditing={handleStartEditing}
                onSaveEditing={handleSaveEditing}
                onCancelEditing={handleCancelEditing}
              />

              {/* Управление полями */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Управление полями анкеты</h2>
                  <div className="flex gap-2">
                    <Button onClick={handleCreateSection} size="sm" variant="outline">
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить секцию
                    </Button>
                    <Button onClick={() => addDivider(null)} size="sm" variant="outline">
                      <Minus className="w-4 h-4 mr-2" />
                      Разделитель
                    </Button>
                    <Button onClick={() => handleAddFields(null)} size="sm">
                      <Plus className="w-4 h-4 mr-2" />
                      Добавить поле
                    </Button>
                  </div>
                </div>

                <FieldsTable
                  sections={sections}
                  groupedFields={groupedFields}
                  collapsedSections={state.collapsedSections}
                  draggedFieldId={fieldDragDrop.draggedFieldId}
                  dragOverFieldId={fieldDragDrop.dragOverFieldId}
                  dragOverPosition={fieldDragDrop.dragOverPosition}
                  dragOverSectionId={fieldDragDrop.dragOverSectionId}
                  draggedSectionFormId={sectionDragDrop.draggedSectionFormId}
                  dragOverSectionFormId={sectionDragDrop.dragOverSectionFormId}
                  sectionDragOverPosition={sectionDragDrop.sectionDragOverPosition}
                  onCreateSection={handleCreateSection}
                  onUpdateSection={(sectionId, data) => updateSection({ sectionId, ...data })}
                  onAddFields={handleAddFields}
                  onRemoveSection={handleRemoveSection}
                  onFieldEdit={handleEditField}
                  onFieldRemove={handleRemoveField}
                  onFieldDragStart={fieldDragDrop.handleDragStart}
                  onFieldDragOver={fieldDragDrop.handleDragOver}
                  onFieldDragLeave={fieldDragDrop.handleDragLeave}
                  onFieldDrop={fieldDragDrop.handleDrop}
                  onFieldDragEnd={fieldDragDrop.handleDragEnd}
                  onEmptySectionDragOver={fieldDragDrop.handleSectionDragOver}
                  onEmptySectionDragLeave={fieldDragDrop.handleSectionDragLeave}
                  onEmptySectionDrop={fieldDragDrop.handleSectionDrop}
                  onSectionDragStart={sectionDragDrop.handleSectionDragStart}
                  onSectionDragOver={sectionDragDrop.handleSectionDragOver}
                  onSectionDragLeave={sectionDragDrop.handleSectionDragLeave}
                  onSectionDrop={sectionDragDrop.handleSectionDrop}
                  onSectionDragEnd={sectionDragDrop.handleSectionDragEnd}
                />
              </div>
            </>
          )}
        </div>
      </main>

      {/* Диалоги */}
      <CreateSectionDialog
        open={state.isCreateSectionDialogOpen}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_CREATE_SECTION_DIALOG' })}
        isCreating={isCreatingSection}
        onSubmit={handleSubmitCreateSection}
      />

      <AddFieldsDialog
        open={state.isAddFieldDialogOpen}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_ADD_FIELD_DIALOG' })}
        fieldsToAdd={fieldsToAdd}
        selectedFieldIds={state.selectedFieldIds}
        searchQuery={state.fieldSearchQuery}
        isAdding={isAddingFields}
        onSearchChange={(query) => dispatch({ type: 'SET_FIELD_SEARCH_QUERY', payload: query })}
        onToggleSelection={(id) => dispatch({ type: 'TOGGLE_FIELD_SELECTION', payload: id })}
        onSubmit={handleSubmitAddFields}
      />

      <EditFieldDialog
        field={state.editingField}
        sections={sections}
        isUpdating={isUpdatingField}
        state={{
          sectionId: state.editFieldSectionId,
          isRequired: state.editFieldIsRequired,
          description: state.editFieldDescription,
          defaultRows: state.editFieldDefaultRows,
          headerColor: state.editFieldHeaderColor,
          activeTab: state.editFieldActiveTab,
          dividerName: state.editFieldDividerName,
        }}
        handlers={{
          onSectionIdChange: (value) =>
            dispatch({ type: 'SET_EDIT_FIELD_SECTION_ID', payload: value }),
          onIsRequiredChange: (value) =>
            dispatch({ type: 'SET_EDIT_FIELD_IS_REQUIRED', payload: value }),
          onDescriptionChange: (value) =>
            dispatch({ type: 'SET_EDIT_FIELD_DESCRIPTION', payload: value }),
          onDividerNameChange: (value) =>
            dispatch({ type: 'SET_EDIT_FIELD_DIVIDER_NAME', payload: value }),
          onDefaultRowsChange: (rows) =>
            dispatch({ type: 'SET_EDIT_FIELD_DEFAULT_ROWS', payload: rows }),
          onHeaderColorChange: (color) =>
            dispatch({ type: 'SET_EDIT_FIELD_HEADER_COLOR', payload: color }),
          onActiveTabChange: (tab) => dispatch({ type: 'SET_EDIT_FIELD_ACTIVE_TAB', payload: tab }),
          onSave: handleSaveEditField,
          onClose: () => dispatch({ type: 'CLOSE_EDIT_FIELD_DIALOG' }),
        }}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </WorkspaceLayout>
  )
}

export function FormTemplateEditorPage() {
  return (
    <FormTemplateProvider>
      <FormTemplateEditorContent />
    </FormTemplateProvider>
  )
}
