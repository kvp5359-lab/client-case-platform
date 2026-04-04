"use client"

/**
 * FormKitView — отображение секций анкеты (поля сверху вниз)
 * Тулбар вынесен наружу (в FormsTabContent).
 * Секции сворачиваемые — стилизованы как папки на вкладке Документы.
 */

import { useState, useMemo, useCallback } from 'react'
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldsGrid } from './FieldsGrid'
import { AutoFillFormDialog } from './dialogs/AutoFillFormDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useFormKitData } from '@/hooks/useFormKitData'
import { useFormKitSave } from '@/hooks/useFormKitSave'
import { useFormKitProgress } from '@/hooks/useFormKitProgress'
import { useFormKitAutoFill } from '@/hooks/useFormKitAutoFill'
import { useFormKitFilter } from '@/hooks/useFormKitFilter'
import { useFormFieldSaveHandlers } from '@/hooks/useFormFieldSaveHandlers'
import { useProjectPermissions } from '@/hooks/permissions'

interface FormKitViewProps {
  formKitId: string
  projectId: string
  workspaceId: string
  filterMode: 'all' | 'action-required'
  autoFillOpen?: boolean
  onAutoFillClose?: () => void
}

export function FormKitView({
  formKitId,
  projectId,
  workspaceId,
  filterMode,
  autoFillOpen = false,
  onAutoFillClose,
}: FormKitViewProps) {
  const showOnlyUnfilled = filterMode === 'action-required'
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)

  const { can } = useProjectPermissions({ projectId })
  const canFillForms = can('forms', 'fill_forms')

  const {
    formKit,
    structure,
    formData,
    setFormData,
    compositeItems,
    selectOptionsMap,
    isLoading,
    error,
  } = useFormKitData({ formKitId })

  const { saveField, saveFieldAsync, saveError } = useFormKitSave({
    formKitId,
  })

  const progress = useFormKitProgress({ structure, formData, compositeItems })

  const { setOriginalValues, updateField, handleSaveField, handleSaveFieldWithValue } =
    useFormFieldSaveHandlers({
      formKitId,
      formData,
      setFormData,
      saveField,
      canFillForms,
    })

  const { handleAutoFillApply } = useFormKitAutoFill({
    structure,
    formData,
    compositeItems,
    saveFieldAsync,
    setFormData,
    setOriginalValues,
  })

  const { filteredSections } = useFormKitFilter({
    structure,
    formData,
    compositeItems,
    showOnlyUnfilled,
  })

  // Активная секция: выбранная пользователем, или первая по умолчанию
  const activeSectionId = useMemo(() => {
    if (selectedSectionId && filteredSections.some((s) => s.id === selectedSectionId)) {
      return selectedSectionId
    }
    return filteredSections[0]?.id ?? null
  }, [selectedSectionId, filteredSections])

  const activeIndex = filteredSections.findIndex((s) => s.id === activeSectionId)
  const hasPrev = activeIndex > 0
  const hasNext = activeIndex < filteredSections.length - 1

  const goToPrev = useCallback(() => {
    if (hasPrev) setSelectedSectionId(filteredSections[activeIndex - 1].id)
  }, [hasPrev, filteredSections, activeIndex])

  const goToNext = useCallback(() => {
    if (hasNext) setSelectedSectionId(filteredSections[activeIndex + 1].id)
  }, [hasNext, filteredSections, activeIndex])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Ошибка загрузки анкеты. Попробуйте обновить страницу.</AlertDescription>
      </Alert>
    )
  }

  if (!formKit || !structure) {
    return (
      <Alert>
        <AlertDescription>Анкета не найдена</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-1">
      {saveError && (
        <Alert variant="destructive">
          <AlertDescription>Ошибка сохранения: {saveError.message}</AlertDescription>
        </Alert>
      )}

      {/* Вкладки секций */}
      {filteredSections.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200">
          {filteredSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setSelectedSectionId(section.id)}
              className={cn(
                'px-3 py-2 text-sm whitespace-nowrap transition-colors border-b-2 -mb-px',
                activeSectionId === section.id
                  ? 'border-foreground text-foreground font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-gray-300',
              )}
            >
              {section.name}
            </button>
          ))}
        </div>
      )}

      {/* Содержимое активной секции */}
      {filteredSections.map((section) => {
        if (filteredSections.length > 1 && section.id !== activeSectionId) return null
        return (
          <div key={section.id} className="pt-2 pb-3">
            <FieldsGrid
              fields={section.fields}
              formData={formData}
              compositeItems={compositeItems}
              selectOptionsMap={selectOptionsMap}
              disabled={!canFillForms}
              updateField={updateField}
              saveField={handleSaveField}
              saveFieldWithValue={handleSaveFieldWithValue}
            />
          </div>
        )
      })}

      {/* Кнопки навигации */}
      {filteredSections.length > 1 && (
        <>
          <div className="border-t border-gray-200 mt-2" />
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={goToPrev}
              disabled={!hasPrev}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors',
                hasPrev
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  : 'text-muted-foreground/30 cursor-default',
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              Назад
            </button>
            <span className="text-xs text-muted-foreground">
              {activeIndex + 1} / {filteredSections.length}
            </span>
            <button
              type="button"
              onClick={goToNext}
              disabled={!hasNext}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md transition-colors',
                hasNext
                  ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                  : 'text-muted-foreground/30 cursor-default',
              )}
            >
              Далее
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </>
      )}

      {filteredSections.length === 0 && (
        <Alert>
          <AlertDescription>
            {showOnlyUnfilled
              ? 'Нет незаполненных полей 🎉'
              : 'В этой анкете пока нет полей для заполнения'}
          </AlertDescription>
        </Alert>
      )}

      {/* Диалог автозаполнения — управляется снаружи */}
      <AutoFillFormDialog
        open={autoFillOpen}
        onOpenChange={(open) => {
          if (!open) onAutoFillClose?.()
        }}
        formKitId={formKitId}
        projectId={projectId}
        workspaceId={workspaceId}
        onApply={handleAutoFillApply}
      />
    </div>
  )
}
