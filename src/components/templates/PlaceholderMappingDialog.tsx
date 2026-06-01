/**
 * PlaceholderMappingDialog — привязка плейсхолдеров DOCX к источникам данных.
 *
 * Источник плейсхолдера — либо поле анкеты (field_definition), либо запись
 * справочника напрямую (custom_directory). Для справочника дополнительно
 * выбирается колонка, значение которой подставляется в документ.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, Library } from 'lucide-react'
import { useUpdateDocumentTemplate } from '@/hooks/documents/useDocumentTemplates'
import type {
  DocumentTemplate,
  DocumentTemplatePlaceholder,
} from '@/services/api/documents/documentTemplateService'
import type { DirectoryFieldOptions } from '@/types/customDirectories'
import type { Json } from '@/types/database'
import { fromSupabaseJson } from '@/utils/supabaseJson'
import { FIELD_TYPE_LABELS } from './field-definition/constants'
import { cn } from '@/lib/utils'
import { fieldDefinitionKeys, customDirectoryKeys } from '@/hooks/queryKeys'

type FieldDefinition = {
  id: string
  name: string
  field_type: string
  options: Json
}

type DirectoryRow = {
  id: string
  name: string
}

/** Колонка справочника для выбора */
type DirectoryColumn = {
  id: string
  name: string
}

/** Выбранный источник: поле анкеты или справочник. */
type Source =
  | { kind: 'field'; id: string }
  | { kind: 'directory'; id: string }
  | null

/** Состояние привязки одного плейсхолдера */
type PlaceholderBinding = {
  source: Source
  /** Колонка справочника (если источник — справочник); null → название записи */
  dirFieldId: string | null
}

type PlaceholderMappingDialogProps = {
  template: DocumentTemplate
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function SourceCombobox({
  fields,
  directories,
  value,
  onChange,
}: {
  fields: FieldDefinition[]
  directories: DirectoryRow[]
  value: Source
  onChange: (value: Source) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selectedField =
    value?.kind === 'field' ? fields.find((f) => f.id === value.id) : undefined
  const selectedDir =
    value?.kind === 'directory' ? directories.find((d) => d.id === value.id) : undefined

  const q = search.trim().toLowerCase()
  const filteredFields = useMemo(() => {
    if (!q) return fields
    return fields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (FIELD_TYPE_LABELS[f.field_type] || f.field_type).toLowerCase().includes(q),
    )
  }, [fields, q])
  const filteredDirs = useMemo(() => {
    if (!q) return directories
    return directories.filter((d) => d.name.toLowerCase().includes(q))
  }, [directories, q])

  const select = (next: Source) => {
    onChange(next)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal h-9 text-sm"
        >
          {selectedField ? (
            <span className="truncate">
              {selectedField.name}
              <span className="text-muted-foreground ml-1.5 text-xs">
                ({FIELD_TYPE_LABELS[selectedField.field_type] || selectedField.field_type})
              </span>
            </span>
          ) : selectedDir ? (
            <span className="truncate flex items-center gap-1.5">
              <Library className="h-3.5 w-3.5 shrink-0 opacity-60" />
              {selectedDir.name}
              <span className="text-muted-foreground ml-0.5 text-xs">(Справочник)</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Не привязано</span>
          )}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Поиск..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
        </div>
        <div className="max-h-[480px] overflow-y-auto p-1" onWheel={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={cn(
              'relative flex w-full cursor-pointer items-center rounded-sm py-1 px-2 text-sm hover:bg-accent',
              !value && 'bg-accent',
            )}
            onClick={() => select(null)}
          >
            <span className="text-muted-foreground">Не привязано</span>
            {!value && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
          </button>

          {filteredFields.length === 0 && filteredDirs.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">Ничего не найдено</div>
          ) : (
            <>
              {filteredFields.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase text-muted-foreground">
                  Поля анкеты
                </div>
              )}
              {filteredFields.map((field) => {
                const active = value?.kind === 'field' && value.id === field.id
                return (
                  <button
                    key={field.id}
                    type="button"
                    className={cn(
                      'relative flex w-full cursor-pointer items-center rounded-sm py-1 px-2 text-sm hover:bg-accent',
                      active && 'bg-accent',
                    )}
                    onClick={() => select({ kind: 'field', id: field.id })}
                  >
                    <span className="truncate">{field.name}</span>
                    <span className="text-muted-foreground ml-1.5 text-xs shrink-0">
                      ({FIELD_TYPE_LABELS[field.field_type] || field.field_type})
                    </span>
                    {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                  </button>
                )
              })}

              {filteredDirs.length > 0 && (
                <div className="px-2 pt-2 pb-1 text-[11px] font-medium uppercase text-muted-foreground">
                  Справочники
                </div>
              )}
              {filteredDirs.map((dir) => {
                const active = value?.kind === 'directory' && value.id === dir.id
                return (
                  <button
                    key={dir.id}
                    type="button"
                    className={cn(
                      'relative flex w-full cursor-pointer items-center rounded-sm py-1 px-2 text-sm hover:bg-accent',
                      active && 'bg-accent',
                    )}
                    onClick={() => select({ kind: 'directory', id: dir.id })}
                  >
                    <Library className="h-3.5 w-3.5 mr-1.5 shrink-0 opacity-60" />
                    <span className="truncate">{dir.name}</span>
                    {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
                  </button>
                )
              })}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function PlaceholderMappingDialog({
  template,
  workspaceId,
  open,
  onOpenChange,
}: PlaceholderMappingDialogProps) {
  const updateMutation = useUpdateDocumentTemplate()

  const placeholders = (template.placeholders || []) as DocumentTemplatePlaceholder[]
  const [mapping, setMapping] = useState<Record<string, PlaceholderBinding>>(() => {
    const initial: Record<string, PlaceholderBinding> = {}
    for (const ph of placeholders) {
      let source: Source = null
      if (ph.field_definition_id) source = { kind: 'field', id: ph.field_definition_id }
      else if (ph.source_directory_id) source = { kind: 'directory', id: ph.source_directory_id }
      initial[ph.name] = { source, dirFieldId: ph.directory_field_id ?? null }
    }
    return initial
  })

  // Поля анкеты (глобальная таблица, без workspace_id)
  const { data: fields = [] } = useQuery({
    queryKey: [...fieldDefinitionKeys.all, 'with-options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('field_definitions')
        .select('id, name, field_type, options')
        .order('name', { ascending: true })
      if (error) throw error
      return data as FieldDefinition[]
    },
    enabled: open,
  })

  // Справочники воркспейса
  const { data: directories = [] } = useQuery({
    queryKey: [...customDirectoryKeys.byWorkspace(workspaceId), 'picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_directories')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('is_archived', false)
        .order('name', { ascending: true })
      if (error) throw error
      return data as DirectoryRow[]
    },
    enabled: open,
  })

  // fieldId → ref_directory_id для полей-справочников (directory_ref)
  const dirIdByField = useMemo(() => {
    const map: Record<string, string> = {}
    for (const f of fields) {
      if (f.field_type === 'directory_ref') {
        const opts = fromSupabaseJson<DirectoryFieldOptions | null>(f.options ?? null)
        if (opts?.ref_directory_id) map[f.id] = opts.ref_directory_id
      }
    }
    return map
  }, [fields])

  // Эффективный справочник для привязки (прямой или через поле-справочник)
  const effectiveDirId = (bind: PlaceholderBinding): string | undefined => {
    if (bind.source?.kind === 'directory') return bind.source.id
    if (bind.source?.kind === 'field') return dirIdByField[bind.source.id]
    return undefined
  }

  const refDirectoryIds = useMemo(() => {
    const ids = new Set<string>()
    for (const b of Object.values(mapping)) {
      const d = effectiveDirId(b)
      if (d) ids.add(d)
    }
    return Array.from(ids).sort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapping, dirIdByField])

  // Колонки всех задействованных справочников: directory_id → [{id, name}]
  const { data: columnsByDir = {} } = useQuery({
    queryKey: [...customDirectoryKeys.all, 'columns-batch', refDirectoryIds.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_directory_fields')
        .select('id, directory_id, name, order_index')
        .in('directory_id', refDirectoryIds)
        .order('order_index', { ascending: true })
      if (error) throw error
      const grouped: Record<string, DirectoryColumn[]> = {}
      for (const f of data ?? []) {
        ;(grouped[f.directory_id] ??= []).push({ id: f.id, name: f.name })
      }
      return grouped
    },
    enabled: open && refDirectoryIds.length > 0,
  })

  const handleSave = async () => {
    const updatedPlaceholders: DocumentTemplatePlaceholder[] = placeholders.map((ph) => {
      const bind = mapping[ph.name] ?? { source: null, dirFieldId: null }
      const dir = effectiveDirId(bind)
      return {
        ...ph,
        field_definition_id: bind.source?.kind === 'field' ? bind.source.id : null,
        source_directory_id: bind.source?.kind === 'directory' ? bind.source.id : null,
        directory_field_id: dir ? (bind.dirFieldId ?? null) : null,
      }
    })

    await updateMutation.mutateAsync({
      id: template.id,
      updates: { placeholders: updatedPlaceholders },
    })

    onOpenChange(false)
  }

  const mappedCount = Object.values(mapping).filter((b) => b.source).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Настройка плейсхолдеров</DialogTitle>
          <DialogDescription>
            Привяжите каждый плейсхолдер из шаблона «{template.name}» к полю анкеты или справочнику.
            При генерации документа плейсхолдеры будут заменены значениями.
          </DialogDescription>
        </DialogHeader>

        {placeholders.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            В этом шаблоне не найдено плейсхолдеров. Убедитесь, что в DOCX-файле есть метки вида{' '}
            {'{{имя_поля}}'}.
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <div className="text-sm text-muted-foreground mb-2">
              Привязано: {mappedCount} из {placeholders.length}
            </div>

            {placeholders.map((ph) => {
              const bind = mapping[ph.name] ?? { source: null, dirFieldId: null }
              const dirId = effectiveDirId(bind)
              const columns = dirId ? (columnsByDir[dirId] ?? []) : []
              return (
                <div key={ph.name} className="flex items-start gap-4">
                  <div className="w-1/3 font-mono text-xs bg-muted px-3 py-2 rounded">
                    {`{{${ph.name}}}`}
                  </div>
                  <div className="w-2/3 space-y-2">
                    <SourceCombobox
                      fields={fields}
                      directories={directories}
                      value={bind.source}
                      onChange={(source) => {
                        setMapping((prev) => ({
                          ...prev,
                          [ph.name]: { source, dirFieldId: null },
                        }))
                      }}
                    />
                    {dirId && (
                      <Select
                        value={bind.dirFieldId ?? '__display__'}
                        onValueChange={(v) => {
                          setMapping((prev) => ({
                            ...prev,
                            [ph.name]: {
                              source: bind.source,
                              dirFieldId: v === '__display__' ? null : v,
                            },
                          }))
                        }}
                      >
                        <SelectTrigger className="h-9 text-sm">
                          <SelectValue placeholder="Колонка справочника" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__display__">Название записи (по умолчанию)</SelectItem>
                          {columns.map((col) => (
                            <SelectItem key={col.id} value={col.id}>
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
