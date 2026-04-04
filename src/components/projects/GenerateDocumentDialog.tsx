"use client"

/**
 * GenerateDocumentDialog — диалог генерации DOCX из шаблона и данных анкет проекта.
 *
 * Пользователь выбирает шаблон документа → видит превью плейсхолдеров →
 * нажимает «Сгенерировать» → скачивается заполненный DOCX.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
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
import { FileDown, Loader2 } from 'lucide-react'
import { useDocumentTemplates, useGenerateDocument } from '@/hooks/documents/useDocumentTemplates'
import type { DocumentTemplatePlaceholder } from '@/services/api/documentTemplateService'

interface GenerateDocumentDialogProps {
  projectId: string
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface FieldDefinitionInfo {
  id: string
  name: string
}

export function GenerateDocumentDialog({
  projectId,
  workspaceId,
  open,
  onOpenChange,
}: GenerateDocumentDialogProps) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const { data: templates = [] } = useDocumentTemplates(workspaceId)
  const generateMutation = useGenerateDocument()

  // Only show templates that have at least some placeholders mapped
  const availableTemplates = templates.filter((t) => {
    const phs = (t.placeholders || []) as DocumentTemplatePlaceholder[]
    return phs.length === 0 || phs.some((p) => p.field_definition_id)
  })

  const selectedTemplate = availableTemplates.find((t) => t.id === selectedTemplateId)
  const placeholders = (selectedTemplate?.placeholders || []) as DocumentTemplatePlaceholder[]
  const mappedFieldIds = placeholders.map((p) => p.field_definition_id).filter(Boolean) as string[]

  // Load field definitions for mapped placeholders
  const { data: fieldDefs = [] } = useQuery({
    queryKey: ['field-definitions-by-ids', mappedFieldIds],
    queryFn: async () => {
      if (mappedFieldIds.length === 0) return []
      const { data, error } = await supabase
        .from('field_definitions')
        .select('id, name')
        .in('id', mappedFieldIds)
      if (error) throw error
      return data as FieldDefinitionInfo[]
    },
    enabled: mappedFieldIds.length > 0,
  })

  // Load current field values for the project
  const { data: projectValues = {} } = useQuery({
    queryKey: ['project-field-values', projectId, mappedFieldIds],
    queryFn: async () => {
      if (mappedFieldIds.length === 0) return {}

      // Get all form_kits for this project
      const { data: formKits } = await supabase
        .from('form_kits')
        .select('id')
        .eq('project_id', projectId)

      const fkIds = (formKits || []).map((fk: { id: string }) => fk.id)
      if (fkIds.length === 0) return {}

      const { data: values } = await supabase
        .from('form_kit_field_values')
        .select('field_definition_id, value, updated_at')
        .in('form_kit_id', fkIds)
        .in('field_definition_id', mappedFieldIds)
        .order('updated_at', { ascending: false })

      // Aggregate: most recent value wins
      const result: Record<string, string> = {}
      const seen = new Set<string>()
      for (const v of values || []) {
        if (!seen.has(v.field_definition_id) && v.value) {
          seen.add(v.field_definition_id)
          result[v.field_definition_id] = v.value
        }
      }
      return result
    },
    enabled: mappedFieldIds.length > 0 && !!projectId,
  })

  const fieldDefMap = useMemo(() => {
    const map: Record<string, string> = {}
    for (const fd of fieldDefs) {
      map[fd.id] = fd.name
    }
    return map
  }, [fieldDefs])

  const handleGenerate = async () => {
    if (!selectedTemplateId) return

    await generateMutation.mutateAsync({
      documentTemplateId: selectedTemplateId,
      projectId,
      workspaceId,
    })

    onOpenChange(false)
  }

  const formatPreviewValue = (value: string | undefined) => {
    if (!value) return '—'
    // Try parsing JSON
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed === 'string') return parsed
      if (Array.isArray(parsed)) return parsed.join(', ')
      return value
    } catch {
      return value.length > 50 ? value.slice(0, 50) + '...' : value
    }
  }

  const hasTemplates = availableTemplates.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Сгенерировать документ</DialogTitle>
          <DialogDescription>
            {hasTemplates
              ? 'Выберите шаблон и нажмите «Сгенерировать». Данные будут взяты из заполненных анкет проекта.'
              : 'Для генерации документов необходимо сначала загрузить DOCX-шаблон.'}
          </DialogDescription>
        </DialogHeader>

        {!hasTemplates ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileDown className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>Нет загруженных шаблонов документов.</p>
            <p className="text-sm mt-1">
              Перейдите в <strong>Настройки → Шаблоны → Генерация</strong> и загрузите DOCX-файл с
              плейсхолдерами.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-4">
              {/* Выбор шаблона */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Шаблон документа</label>
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите шаблон..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTemplates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Превью заполнения */}
              {selectedTemplate && placeholders.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Данные для подстановки</label>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 font-medium">Плейсхолдер</th>
                          <th className="text-left px-3 py-2 font-medium">Поле</th>
                          <th className="text-left px-3 py-2 font-medium">Значение</th>
                        </tr>
                      </thead>
                      <tbody>
                        {placeholders.map((ph) => (
                          <tr key={ph.name} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">{`{{${ph.name}}}`}</td>
                            <td className="px-3 py-2">
                              {ph.field_definition_id ? (
                                fieldDefMap[ph.field_definition_id] || '—'
                              ) : (
                                <span className="text-muted-foreground">Не привязано</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {ph.field_definition_id ? (
                                <span
                                  className={
                                    projectValues[ph.field_definition_id]
                                      ? 'text-green-700'
                                      : 'text-muted-foreground'
                                  }
                                >
                                  {formatPreviewValue(projectValues[ph.field_definition_id])}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={!selectedTemplateId || generateMutation.isPending}
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Генерация...
                  </>
                ) : (
                  'Сгенерировать'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
