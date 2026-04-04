"use client"

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { FormKitForAi } from '@/services/api/messengerAiService'

/**
 * Load form kits data for AI context.
 * Batches all fields and values in 2 queries instead of N+1.
 */
export async function fetchFormKitsForAi(projectId: string): Promise<FormKitForAi[]> {
  const { data: kits } = await supabase
    .from('form_kits')
    .select('id, name')
    .eq('project_id', projectId)

  if (!kits || kits.length === 0) return []

  const kitIds = kits.map((k) => k.id)

  const [{ data: allFields }, { data: allValues }] = await Promise.all([
    supabase
      .from('form_kit_fields')
      .select(
        'form_kit_id, field_definition_id, name, field_type, form_kit_section_id, form_kit_sections(name, sort_order)',
      )
      .in('form_kit_id', kitIds)
      .order('sort_order'),
    supabase
      .from('form_kit_field_values')
      .select('form_kit_id, field_definition_id, composite_field_id, value')
      .in('form_kit_id', kitIds),
  ])

  if (!allFields || !allValues) return []

  const fieldsByKit = new Map<string, typeof allFields>()
  for (const f of allFields) {
    const arr = fieldsByKit.get(f.form_kit_id) ?? []
    arr.push(f)
    fieldsByKit.set(f.form_kit_id, arr)
  }

  const valuesByKit = new Map<string, typeof allValues>()
  for (const v of allValues) {
    const arr = valuesByKit.get(v.form_kit_id) ?? []
    arr.push(v)
    valuesByKit.set(v.form_kit_id, arr)
  }

  const allCompositeSubFieldIds = new Set<string>()
  for (const v of allValues) {
    if (v.composite_field_id && v.value) {
      allCompositeSubFieldIds.add(v.field_definition_id)
    }
  }

  const subFieldNames = new Map<string, string>()
  if (allCompositeSubFieldIds.size > 0) {
    const { data: defs } = await supabase
      .from('field_definitions')
      .select('id, name')
      .in('id', [...allCompositeSubFieldIds])
    if (defs) {
      for (const d of defs) subFieldNames.set(d.id, d.name)
    }
  }

  const result: FormKitForAi[] = []

  for (const kit of kits) {
    const fields = fieldsByKit.get(kit.id) ?? []
    const values = valuesByKit.get(kit.id) ?? []

    const simpleValueMap = new Map<string, string>()
    const compositeValues = new Map<string, Array<{ subFieldDefId: string; value: string }>>()

    for (const v of values) {
      if (!v.value) continue
      if (v.composite_field_id) {
        const arr = compositeValues.get(v.composite_field_id) ?? []
        arr.push({ subFieldDefId: v.field_definition_id, value: v.value })
        compositeValues.set(v.composite_field_id, arr)
      } else {
        simpleValueMap.set(v.field_definition_id, v.value)
      }
    }

    const fieldsList = fields
      .map((f) => {
        const section = f.form_kit_sections as { name: string; sort_order: number } | null
        const sectionName = section?.name ?? null
        const sectionOrder = section?.sort_order ?? 999

        if (f.field_type === 'composite') {
          const subs = compositeValues.get(f.field_definition_id)
          if (!subs || subs.length === 0) {
            return { sectionName, sectionOrder, fieldName: f.name, value: null }
          }
          const parts = subs.map((s) => {
            const name = subFieldNames.get(s.subFieldDefId) ?? ''
            return name ? `${name}: ${s.value}` : s.value
          })
          return { sectionName, sectionOrder, fieldName: f.name, value: parts.join(', ') }
        }

        return {
          sectionName,
          sectionOrder,
          fieldName: f.name,
          value: simpleValueMap.get(f.field_definition_id) ?? null,
        }
      })
      .sort((a, b) => a.sectionOrder - b.sectionOrder)

    if (fieldsList.some((f) => f.value)) {
      result.push({ name: kit.name, fields: fieldsList })
    }
  }

  return result
}

export function useFormKitsForAi(projectId: string) {
  return useQuery({
    queryKey: ['messenger-ai', 'form-kits', projectId],
    queryFn: () => fetchFormKitsForAi(projectId),
    enabled: !!projectId,
    staleTime: 5 * 60 * 1000,
  })
}
