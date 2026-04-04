"use client"

import { useEffect, useState } from 'react'
import { useCreateDocumentKitMutation } from '@/hooks/useDocumentKitsQuery'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { supabase } from '@/lib/supabase'

interface AddDocumentKitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  workspaceId: string
  onKitCreated?: (kitId: string) => void
  templateDocumentKitIds?: string[] // ID наборов, которые добавлены в тип проекта
}

interface TemplateWithFolders {
  id: string
  name: string
  description: string | null
  folderCount: number
  folders?: Array<{
    name: string
    description: string | null
  }>
}

export function AddDocumentKitDialog({
  open,
  onOpenChange,
  projectId,
  workspaceId,
  onKitCreated,
  templateDocumentKitIds = [],
}: AddDocumentKitDialogProps) {
  const createMutation = useCreateDocumentKitMutation()
  const [templates, setTemplates] = useState<TemplateWithFolders[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set())
  const [existingKitTemplateIds, setExistingKitTemplateIds] = useState<string[]>([])
  const [isCreating, setIsCreating] = useState(false)

  // Загружаем шаблоны и существующие наборы при открытии диалога
  useEffect(() => {
    if (!open) return
    let cancelled = false

    const load = async () => {
      setLoadingTemplates(true)
      setSelectedTemplateIds(new Set())
      try {
        const { data: templatesData, error: templatesError } = await supabase
          .from('document_kit_templates')
          .select('id, name, description')
          .eq('workspace_id', workspaceId)
          .order('name', { ascending: true })

        if (cancelled) return
        if (templatesError) throw templatesError

        // Один запрос для подсчёта папок всех шаблонов (вместо N запросов)
        const templateIds = (templatesData || []).map((t) => t.id)
        const folderCountMap: Record<string, number> = {}

        if (templateIds.length > 0) {
          const { data: foldersData, error: foldersError } = await supabase
            .from('document_kit_template_folders')
            .select('kit_template_id')
            .in('kit_template_id', templateIds)

          if (cancelled) return
          if (!foldersError && foldersData) {
            for (const folder of foldersData) {
              folderCountMap[folder.kit_template_id] =
                (folderCountMap[folder.kit_template_id] || 0) + 1
            }
          }
        }

        const templatesWithCount = (templatesData || []).map((template) => ({
          ...template,
          folderCount: folderCountMap[template.id] || 0,
        }))

        if (cancelled) return
        setTemplates(templatesWithCount)
      } catch (error) {
        if (!cancelled) {
          logger.error('Ошибка загрузки шаблонов:', error)
          toast.error('Ошибка загрузки шаблонов наборов документов')
        }
      } finally {
        if (!cancelled) setLoadingTemplates(false)
      }

      // Загружаем существующие наборы
      try {
        const { data, error } = await supabase
          .from('document_kits')
          .select('template_id')
          .eq('project_id', projectId)

        if (cancelled) return
        if (error) throw error

        const kitTemplateIds = (data || [])
          .map((kit) => kit.template_id)
          .filter((id): id is string => id !== null)

        setExistingKitTemplateIds(kitTemplateIds)
      } catch (error) {
        if (!cancelled) {
          logger.error('Ошибка загрузки существующих наборов документов:', error)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [open, workspaceId, projectId])

  const handleTemplateToggle = (templateId: string) => {
    setSelectedTemplateIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (selectedTemplateIds.size === 0) return

    const toCreate = Array.from(selectedTemplateIds)

    setIsCreating(true)
    let created = 0
    let lastKitId = ''
    try {
      // Проверяем актуальный список существующих наборов перед созданием
      const { data: currentKits } = await supabase
        .from('document_kits')
        .select('template_id')
        .eq('project_id', projectId)
      const currentTemplateIds = new Set(
        (currentKits || []).map((k) => k.template_id).filter(Boolean),
      )

      for (const templateId of toCreate) {
        // Пропускаем, если набор с таким шаблоном уже создан в проекте
        if (currentTemplateIds.has(templateId)) continue

        lastKitId = await createMutation.mutateAsync({
          templateId,
          projectId,
          workspaceId,
        })
        created++
      }

      toast.success(created === 1 ? 'Набор документов создан' : `Создано наборов: ${created}`)

      onOpenChange(false)
      setSelectedTemplateIds(new Set())

      if (onKitCreated && lastKitId) {
        onKitCreated(lastKitId)
      }
    } catch (error) {
      logger.error('Ошибка создания набора документов:', error)
      if (created > 0) {
        toast.warning(
          `Создано ${created} из ${toCreate.length} наборов. Остальные не удалось создать.`,
        )
      } else {
        toast.error('Ошибка создания набора документов')
      }
    } finally {
      setIsCreating(false)
    }
  }

  const availableCount = selectedTemplateIds.size

  const renderTemplateRow = (template: TemplateWithFolders, bgHover: string) => {
    const isAlreadyAdded = existingKitTemplateIds.includes(template.id)
    return (
      <button
        type="button"
        key={template.id}
        className={`flex items-center gap-3 py-1.5 px-2 rounded transition-colors ${bgHover} cursor-pointer w-full text-left`}
        onClick={() => handleTemplateToggle(template.id)}
      >
        <Checkbox
          checked={selectedTemplateIds.has(template.id)}
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={() => handleTemplateToggle(template.id)}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{template.name}</p>
          {isAlreadyAdded && (
            <p className="text-xs text-muted-foreground">Уже добавлен (можно добавить ещё)</p>
          )}
        </div>
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Добавить набор документов</DialogTitle>
          <DialogDescription>
            Выберите один или несколько шаблонов для создания в проекте
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {loadingTemplates ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Нет доступных шаблонов наборов документов</p>
              <p className="text-sm text-muted-foreground mt-2">
                Создайте шаблоны в разделе «Настройки → Шаблоны»
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {existingKitTemplateIds.length > 0 && (
                <Alert variant="default" className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    Можно добавить набор повторно (например, для разных членов семьи)
                  </AlertDescription>
                </Alert>
              )}

              {/* Группа: Добавленные в тип проекта */}
              {templates.filter((t) => templateDocumentKitIds.includes(t.id)).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground px-1">
                    Добавлены в тип проекта
                  </h3>
                  <div className="space-y-1 border rounded-lg p-3 bg-muted/20">
                    {templates
                      .filter((t) => templateDocumentKitIds.includes(t.id))
                      .map((template) => renderTemplateRow(template, 'hover:bg-background/60'))}
                  </div>
                </div>
              )}

              {/* Группа: Не добавлены в тип проекта */}
              {templates.filter((t) => !templateDocumentKitIds.includes(t.id)).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2 text-muted-foreground px-1">
                    Другие шаблоны
                  </h3>
                  <div className="space-y-1 border rounded-lg p-3">
                    {templates
                      .filter((t) => !templateDocumentKitIds.includes(t.id))
                      .map((template) => renderTemplateRow(template, 'hover:bg-muted/30'))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleCreate} disabled={availableCount === 0 || isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {availableCount > 1 ? `Создать наборы (${availableCount})` : 'Создать набор'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
