"use client"

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formKitKeys } from '@/hooks/queryKeys'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CheckCircle2, Loader2 } from 'lucide-react'
import type { ExtractionResult } from './types'

interface AutoFillResultsProps {
  result: ExtractionResult
  formKitId: string
  onApply: () => void
  onCancel: () => void
  isApplying: boolean
}

interface FieldRow {
  id: string
  name: string
  field_definition_id: string
  form_kit_section_id: string | null
  sort_order: number
}

interface SectionRow {
  id: string
  name: string
}

export function AutoFillResults({
  result,
  formKitId,
  onApply,
  onCancel,
  isApplying,
}: AutoFillResultsProps) {
  // Используем тот же queryKey что и useFormKitData — данные могут быть в кэше (staleTime 5 мин)
  const { data: fieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: [...formKitKeys.structure(formKitId), 'autofill-fields'],
    queryFn: async () => {
      const [fieldsResult, sectionsResult] = await Promise.all([
        supabase
          .from('form_kit_fields')
          .select('id, name, field_definition_id, form_kit_section_id, sort_order')
          .eq('form_kit_id', formKitId)
          .order('sort_order', { ascending: true }),
        supabase.from('form_kit_sections').select('id, name').eq('form_kit_id', formKitId),
      ])

      if (fieldsResult.error) throw fieldsResult.error
      if (sectionsResult.error) throw sectionsResult.error

      const sectionsMap: Record<string, string> = {}
      ;(sectionsResult.data as SectionRow[]).forEach((s) => {
        sectionsMap[s.id] = s.name
      })

      return {
        fields: fieldsResult.data as FieldRow[],
        sections: sectionsMap,
      }
    },
    staleTime: 5 * 60 * 1000,
  })

  const sections = fieldsData?.sections ?? {}

  // Группировка и фильтрация — мемоизировано
  const filledFieldsBySection = useMemo(() => {
    const fields = fieldsData?.fields ?? []
    const fieldsBySection: Record<string, FieldRow[]> = {}
    fields.forEach((field) => {
      const sectionId = field.form_kit_section_id || 'no-section'
      if (!fieldsBySection[sectionId]) fieldsBySection[sectionId] = []
      fieldsBySection[sectionId].push(field)
    })

    const filled: Record<
      string,
      { field: FieldRow; value: string | number | boolean | null | Record<string, unknown> }[]
    > = {}
    Object.entries(fieldsBySection).forEach(([sectionId, sectionFields]) => {
      const items = sectionFields
        .map((field) => ({
          field,
          value: result.extracted_data[field.field_definition_id],
        }))
        .filter((item) => item.value !== undefined && item.value !== null && item.value !== '')

      if (items.length > 0) filled[sectionId] = items
    })

    return filled
  }, [fieldsData?.fields, result.extracted_data])

  if (fieldsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <AlertDescription className="text-green-800">
          Заполнено {result.stats.filled} из {result.stats.total} полей ({result.stats.percentage}%)
        </AlertDescription>
      </Alert>

      <div className="max-h-96 overflow-y-auto border rounded-lg">
        {Object.entries(filledFieldsBySection).map(([sectionId, filledFields]) => {
          const sectionName = sections[sectionId] || 'Без секции'

          return (
            <div key={sectionId} className="border-b last:border-b-0">
              <div className="font-semibold text-sm bg-muted px-3 py-1.5 sticky top-0">
                {sectionName} ({filledFields.length})
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {filledFields.map(({ field, value }) => {
                    const displayValue =
                      typeof value === 'object' ? JSON.stringify(value) : String(value)
                    const truncatedValue =
                      displayValue.length > 80
                        ? displayValue.substring(0, 80) + '...'
                        : displayValue

                    return (
                      <tr key={field.id} className="border-b last:border-b-0 hover:bg-muted/50">
                        <td className="px-3 py-1.5 font-medium text-muted-foreground w-1/3">
                          {field.name}
                        </td>
                        <td className="px-3 py-1.5 text-foreground">{truncatedValue}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      <Alert>
        <AlertDescription className="text-sm">
          Проверьте извлечённые данные перед применением
        </AlertDescription>
      </Alert>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isApplying} className="flex-1">
          Отмена
        </Button>
        <Button onClick={onApply} disabled={isApplying} className="flex-1">
          {isApplying ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Применение...
            </>
          ) : (
            'Применить'
          )}
        </Button>
      </div>
    </div>
  )
}
