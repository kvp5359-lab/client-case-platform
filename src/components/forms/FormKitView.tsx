"use client"

/**
 * FormKitView — отображение секций анкеты (поля сверху вниз)
 * Тулбар вынесен наружу (в FormsTabContent).
 * Секции в режиме аккордеона — открыта всегда ровно одна.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, ChevronRight, ChevronLeft, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { FieldsGrid } from './FieldsGrid'
import { AutoFillFormDialog } from './dialogs/AutoFillFormDialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useFormKitData } from '@/hooks/useFormKitData'
import { useFormKitSave } from '@/hooks/useFormKitSave'
import { useFormKitAutoFill } from '@/hooks/useFormKitAutoFill'
import { useFormKitFilter } from '@/hooks/useFormKitFilter'
import { computeSectionProgress } from './sectionProgress'
import { hexWithAlpha } from './sectionColors'
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

const ACTIVE_SECTION_STORAGE_PREFIX = 'formKitActiveSection:'

export function FormKitView({
  formKitId,
  projectId,
  workspaceId,
  filterMode,
  autoFillOpen = false,
  onAutoFillClose,
}: FormKitViewProps) {
  const showOnlyUnfilled = filterMode === 'action-required'
  const storageKey = `${ACTIVE_SECTION_STORAGE_PREFIX}${formKitId}`

  const [activeSectionId, setActiveSectionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    try {
      return window.localStorage.getItem(storageKey)
    } catch {
      return null
    }
  })

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

  // Прогресс по каждой секции (от оригинальной структуры — не зависит от фильтра)
  const progressBySectionId = useMemo(() => {
    const map = new Map<string, { filled: number; total: number }>()
    if (!structure) return map
    for (const section of structure.sections) {
      map.set(section.id, computeSectionProgress(section, formData, compositeItems))
    }
    return map
  }, [structure, formData, compositeItems])

  // Активная секция: сохранённая, иначе первая. Если сохранённая исчезла из filteredSections — fallback на первую.
  const resolvedActiveId = useMemo(() => {
    if (activeSectionId && filteredSections.some((s) => s.id === activeSectionId)) {
      return activeSectionId
    }
    return filteredSections[0]?.id ?? null
  }, [activeSectionId, filteredSections])

  useEffect(() => {
    if (typeof window === 'undefined' || !resolvedActiveId) return
    try {
      window.localStorage.setItem(storageKey, resolvedActiveId)
    } catch {
      /* noop */
    }
  }, [resolvedActiveId, storageKey])

  const activeIndex = filteredSections.findIndex((s) => s.id === resolvedActiveId)
  const hasPrev = activeIndex > 0
  const hasNext = activeIndex >= 0 && activeIndex < filteredSections.length - 1

  const goToPrev = useCallback(() => {
    if (hasPrev) setActiveSectionId(filteredSections[activeIndex - 1].id)
  }, [hasPrev, filteredSections, activeIndex])

  const goToNext = useCallback(() => {
    if (hasNext) setActiveSectionId(filteredSections[activeIndex + 1].id)
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

      {/* Секции-аккордеон — открыта ровно одна */}
      <div className="space-y-2">
        {filteredSections.map((section) => {
          const isActive = section.id === resolvedActiveId
          const showHeader = filteredSections.length > 1
          const customColor = section.header_color || null
          const headerStyle = customColor ? { backgroundColor: customColor } : undefined
          const bodyStyle = customColor
            ? { backgroundColor: hexWithAlpha(customColor, 0.25) }
            : undefined
          return (
            <div
              key={section.id}
              className={cn(
                'rounded-lg border border-border bg-card overflow-hidden transition-shadow',
                isActive ? 'shadow-lg' : 'shadow-none',
              )}
            >
              {showHeader && (() => {
                const progress = progressBySectionId.get(section.id)
                const isComplete = progress && progress.total > 0 && progress.filled === progress.total
                return (
                  <button
                    type="button"
                    onClick={() => setActiveSectionId(section.id)}
                    style={headerStyle}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm font-medium transition-colors text-foreground',
                      !customColor && (isActive ? 'bg-muted' : 'bg-muted/40 hover:bg-muted/70'),
                    )}
                    aria-expanded={isActive}
                  >
                    <ChevronRight
                      className={cn(
                        'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                        isActive && 'rotate-90',
                      )}
                    />
                    <span>{section.name}</span>
                    {progress && progress.total > 0 && (
                      <span
                        className={cn(
                          'shrink-0 text-xs tabular-nums font-medium',
                          isComplete ? 'text-emerald-600' : 'text-muted-foreground',
                        )}
                      >
                        {progress.filled} / {progress.total}
                      </span>
                    )}
                  </button>
                )
              })()}
              {isActive && (
                <div
                  style={bodyStyle}
                  className={cn(showHeader ? 'px-4 py-5' : 'py-3')}
                >
                  {section.description && (
                    <div className="mb-5 flex gap-2.5 rounded-md border-l-2 border-primary/50 bg-muted/40 px-3 py-2.5">
                      <Info className="h-4 w-4 shrink-0 text-primary/70 mt-0.5" />
                      <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                        {section.description}
                      </p>
                    </div>
                  )}
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

                  {/* Навигация по секциям — слева под полями */}
                  {filteredSections.length > 1 && (
                    <div className="flex items-center justify-start gap-2 mt-6 pt-4 border-t border-border">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={goToPrev}
                        disabled={!hasPrev}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Назад
                      </Button>
                      <span className="text-xs text-muted-foreground px-2">
                        {activeIndex + 1} / {filteredSections.length}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={goToNext}
                        disabled={!hasNext}
                      >
                        Далее
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

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
