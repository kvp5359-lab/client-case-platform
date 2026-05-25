"use client"

/**
 * ProjectFieldsSection — кастомные поля проекта на вкладке «Настройки».
 *
 * Грузит привязанные к шаблону поля (project_template_field_links →
 * field_definitions) и значения для конкретного проекта
 * (project_field_values). Сохраняет значения по blur/change через upsert.
 *
 * Для типа `directory_ref` рендерится выпадашка значений из привязанного
 * пользовательского справочника (берём primary-поле записи как лейбл).
 */

import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import type { FieldDefinition, FieldOptions } from '@/types/formKit'
import { fromSupabaseJson } from '@/utils/supabaseJson'
import { projectFieldsKeys } from '@/hooks/queryKeys'
import { RowField, type EntryRow } from './ProjectFieldsSection/RowField'

type Props = {
  projectId: string
  templateId: string | null
  disabled?: boolean
}

type LinkedField = {
  link_id: string
  is_required: boolean
  order_index: number
  field: FieldDefinition
}

const fieldsKey = (templateId: string | null) =>
  ['project-fields-for-template', templateId] as const
const valuesKey = (projectId: string) => ['project-field-values', projectId] as const

export function ProjectFieldsSection({ projectId, templateId, disabled }: Props) {
  const queryClient = useQueryClient()
  // Несохранённые локальные правки. Если для поля есть запись здесь — берём её,
  // иначе — значение из storedValues. Сохранённые правки чистятся onSuccess.
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  // Поля, привязанные к шаблону проекта
  const { data: linked = [] } = useQuery({
    queryKey: fieldsKey(templateId),
    queryFn: async (): Promise<LinkedField[]> => {
      if (!templateId) return []
      const { data, error } = await supabase
        .from('project_template_field_links')
        .select('id, order_index, is_required, field:field_definitions(*)')
        .eq('template_id', templateId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return (data ?? []).map((row) => ({
        link_id: row.id,
        order_index: row.order_index,
        is_required: row.is_required,
        field: row.field as unknown as FieldDefinition,
      }))
    },
    enabled: !!templateId,
  })

  // Сохранённые значения
  const { data: storedValues = [] } = useQuery({
    queryKey: valuesKey(projectId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_field_values')
        .select('field_definition_id, value')
        .eq('project_id', projectId)
      if (error) throw error
      return data
    },
  })

  // Карта сохранённых значений
  const savedMap = useMemo(() => {
    const map: Record<string, unknown> = {}
    storedValues.forEach((row) => {
      map[row.field_definition_id] = row.value
    })
    return map
  }, [storedValues])

  // Список привязанных к полям справочников — нужно прогрузить их записи
  const refDirectoryIds = useMemo(() => {
    const ids = new Set<string>()
    linked.forEach((l) => {
      if (l.field.field_type === 'directory_ref') {
        const opts = fromSupabaseJson<FieldOptions | null>(l.field.options ?? null)
        const id = opts?.ref_directory_id
        if (id) ids.add(id)
      }
    })
    return Array.from(ids)
  }, [linked])

  const { data: directoryEntriesByDir = {} } = useQuery({
    queryKey: projectFieldsKeys.customDirectoryEntriesBatch(refDirectoryIds.join(',')),
    queryFn: async () => {
      if (refDirectoryIds.length === 0) return {} as Record<string, EntryRow[]>
      // Получаем primary-поле для каждого справочника
      const { data: fields, error: fErr } = await supabase
        .from('custom_directory_fields')
        .select('id, directory_id, name, is_primary, order_index')
        .in('directory_id', refDirectoryIds)
      if (fErr) throw fErr
      const primaryByDir = new Map<string, string>()
      const firstFieldByDir = new Map<string, string>()
      ;(fields ?? []).forEach((f) => {
        if (f.is_primary && !primaryByDir.has(f.directory_id)) {
          primaryByDir.set(f.directory_id, f.id)
        }
        if (!firstFieldByDir.has(f.directory_id)) {
          firstFieldByDir.set(f.directory_id, f.id)
        }
      })

      // Получаем записи всех нужных справочников
      const { data: entries, error: eErr } = await supabase
        .from('custom_directory_entries')
        .select('id, directory_id')
        .in('directory_id', refDirectoryIds)
      if (eErr) throw eErr

      const entryIds = (entries ?? []).map((e) => e.id)
      // Подтянем значения primary-полей
      const labelFieldIds = Array.from(
        new Set(
          refDirectoryIds.map(
            (dir) => primaryByDir.get(dir) ?? firstFieldByDir.get(dir),
          ),
        ),
      ).filter((id): id is string => !!id)

      const { data: values, error: vErr } = await supabase
        .from('custom_directory_values')
        .select('entry_id, field_id, value_text, value_number, value_date, value_json')
        .in('entry_id', entryIds)
        .in('field_id', labelFieldIds)
      if (vErr) throw vErr

      const labelByEntry = new Map<string, string>()
      ;(values ?? []).forEach((v) => {
        const raw =
          v.value_text ??
          (v.value_number !== null ? String(v.value_number) : null) ??
          v.value_date ??
          (v.value_json !== null ? JSON.stringify(v.value_json).replace(/^"|"$/g, '') : null)
        if (raw != null) labelByEntry.set(v.entry_id, raw)
      })

      const grouped: Record<string, EntryRow[]> = {}
      ;(entries ?? []).forEach((e) => {
        const list = grouped[e.directory_id] ?? (grouped[e.directory_id] = [])
        list.push({ id: e.id, label: labelByEntry.get(e.id) ?? '(без названия)' })
      })
      Object.values(grouped).forEach((list) =>
        list.sort((a, b) => a.label.localeCompare(b.label, 'ru')),
      )
      return grouped
    },
    enabled: refDirectoryIds.length > 0,
  })

  // Сохранение значения (upsert)
  const upsertMutation = useMutation({
    mutationFn: async ({
      fieldId,
      value,
    }: {
      fieldId: string
      value: unknown
    }) => {
      // value === null/undefined/'' -> удаляем запись
      const isEmpty =
        value === null || value === undefined || (typeof value === 'string' && value.length === 0)
      if (isEmpty) {
        const { error } = await supabase
          .from('project_field_values')
          .delete()
          .eq('project_id', projectId)
          .eq('field_definition_id', fieldId)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_field_values')
          .upsert(
            {
              project_id: projectId,
              field_definition_id: fieldId,
              value: value as never,
            },
            { onConflict: 'project_id,field_definition_id' },
          )
        if (error) throw error
      }
    },
    onError: () => {
      toast.error('Не удалось сохранить значение')
    },
    onSuccess: (_, vars) => {
      // Сохранилось — чистим draft по этому полю; правда придёт из refetch
      setDraft((prev) => {
        const next = { ...prev }
        delete next[vars.fieldId]
        return next
      })
      queryClient.invalidateQueries({ queryKey: valuesKey(projectId) })
    },
  })

  if (!templateId || linked.length === 0) return null

  const updateLocal = (fieldId: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [fieldId]: value }))
  }

  const save = (fieldId: string, value: unknown) => {
    upsertMutation.mutate({ fieldId, value })
  }

  return (
    <div className="max-w-3xl rounded-lg border p-6">
      <h3 className="text-base font-semibold mb-4">Поля</h3>
      <div className="grid grid-cols-[140px_1fr] gap-y-4 items-start text-sm">
        {linked.map((l) => {
          const fid = l.field.id
          const value = fid in draft ? draft[fid] : savedMap[fid]
          return (
            <RowField
              key={fid}
              field={l.field}
              isRequired={l.is_required}
              value={value}
              onLocalChange={(v) => updateLocal(fid, v)}
              onCommit={(v) => save(fid, v)}
              disabled={!!disabled}
              directoryEntries={
                l.field.field_type === 'directory_ref'
                  ? directoryEntriesByDir[
                      fromSupabaseJson<FieldOptions | null>(l.field.options ?? null)
                        ?.ref_directory_id ?? ''
                    ] ?? []
                  : []
              }
            />
          )
        })}
      </div>
    </div>
  )
}

