"use client"

import { useEffect, useState } from 'react'
import { useCreateFormKit } from '@/hooks/useFormKitsQuery'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { formKitKeys } from '@/hooks/queryKeys'
import { extractGoogleSheetsId } from '@/utils/googleDrive'
import { useBriefTemplateSheet } from './useBriefTemplateSheet'

export type Mode = 'template' | 'google-sheet'
export type GoogleSheetSubMode = 'existing' | 'from-template'

export interface TemplateWithFields {
  id: string
  name: string
  description: string | null
  fieldCount: number
}

interface UseAddFormKitParams {
  open: boolean
  projectId: string
  workspaceId: string
  templateFormIds: string[]
  googleDriveFolderLink?: string | null
  projectName?: string
  onOpenChange: (open: boolean) => void
  onKitCreated?: (kitId: string) => void
}

export function useAddFormKit({
  open,
  projectId,
  workspaceId,
  templateFormIds,
  googleDriveFolderLink,
  projectName,
  onOpenChange,
  onKitCreated,
}: UseAddFormKitParams) {
  const createFormKit = useCreateFormKit(projectId, workspaceId)
  const queryClient = useQueryClient()

  const [mode, setMode] = useState<Mode>('template')
  const [googleSheetSubMode, setGoogleSheetSubMode] = useState<GoogleSheetSubMode>('existing')
  const [templates, setTemplates] = useState<TemplateWithFields[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [existingKitTemplateIds, setExistingKitTemplateIds] = useState<string[]>([])

  const defaultBriefName = projectName ? `Бриф — ${projectName}` : ''
  const [sheetName, setSheetName] = useState(defaultBriefName)
  const [sheetLink, setSheetLink] = useState('')
  const [sheetFileName, setSheetFileName] = useState<string | null>(null)
  const [isCreatingSheet, setIsCreatingSheet] = useState(false)

  const [briefName, setBriefName] = useState(defaultBriefName)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isCreatingBrief, setIsCreatingBrief] = useState(false)

  const {
    briefTemplateSheetId,
    briefTemplateLink,
    briefTemplateSheetName,
    hasBriefTemplate,
    handleBriefTemplateLinkChange,
    reset: resetBriefTemplate,
  } = useBriefTemplateSheet({ open, projectId, workspaceId })

  // Load sheet file name when sheetLink changes
  useEffect(() => {
    const sheetId = extractGoogleSheetsId(sheetLink)
    if (!sheetId || !workspaceId) {
      setSheetFileName(null)
      return
    }
    let cancelled = false
    supabase.functions
      .invoke('google-drive-get-folder-name', {
        body: { folderId: sheetId, workspaceId },
      })
      .then(({ data, error }) => {
        if (cancelled) return
        setSheetFileName(!error && data?.name ? data.name : null)
      })
    return () => {
      cancelled = true
    }
  }, [sheetLink, workspaceId])

  useEffect(() => {
    if (open) {
      loadTemplates()
      loadExistingKits()
      if (templateFormIds.length > 0 && !selectedTemplateId) {
        setSelectedTemplateId(templateFormIds[0])
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, templateFormIds, projectId])

  useEffect(() => {
    if (!open) {
      setMode('template')
      setGoogleSheetSubMode('existing')
      setSelectedTemplateId(null)
      setSheetName(defaultBriefName)
      setSheetLink('')
      setSheetFileName(null)
      setBriefName(defaultBriefName)
      setSelectedFolderId(null)
      resetBriefTemplate()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const { data: templatesData, error: templatesError } = await supabase
        .from('form_templates')
        .select('id, name, description')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true })

      if (templatesError) throw templatesError

      const templatesWithCount = await Promise.all(
        (templatesData || []).map(async (template) => {
          const { count, error } = await supabase
            .from('form_template_fields')
            .select('*', { count: 'exact', head: true })
            .eq('form_template_id', template.id)

          return { ...template, fieldCount: error ? 0 : count || 0 }
        }),
      )

      setTemplates(templatesWithCount)
    } catch (error) {
      logger.error('Ошибка загрузки шаблонов анкет:', error)
      toast.error('Ошибка загрузки шаблонов анкет')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const loadExistingKits = async () => {
    try {
      const { data, error } = await supabase
        .from('form_kits')
        .select('template_id')
        .eq('project_id', projectId)

      if (error) throw error

      const kitTemplateIds = (data || [])
        .map((kit) => kit.template_id)
        .filter((id): id is string => id !== null)

      setExistingKitTemplateIds(kitTemplateIds)
    } catch (error) {
      logger.error('Ошибка загрузки существующих анкет:', error)
    }
  }

  const handleTemplateToggle = (templateId: string) => {
    setSelectedTemplateId((prev) => (prev === templateId ? null : templateId))
  }

  const handleCreateFromTemplate = async () => {
    if (!selectedTemplateId) return

    if (existingKitTemplateIds.includes(selectedTemplateId)) {
      toast.error('Эта анкета уже добавлена в проект')
      return
    }

    createFormKit.mutate(selectedTemplateId, {
      onSuccess: (newKitId) => {
        onOpenChange(false)
        setSelectedTemplateId(null)
        if (onKitCreated) onKitCreated(newKitId)
      },
    })
  }

  const handleCreateFromGoogleSheet = async () => {
    const name = sheetName.trim()
    if (!name) {
      toast.error('Введите название анкеты')
      return
    }

    const sheetId = extractGoogleSheetsId(sheetLink)
    if (!sheetId) {
      toast.error('Неверная ссылка на Google Таблицу')
      return
    }

    setIsCreatingSheet(true)
    try {
      const { data, error } = await supabase
        .from('form_kits')
        .insert({ project_id: projectId, workspace_id: workspaceId, name, brief_sheet_id: sheetId })
        .select('id')
        .single()

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      onOpenChange(false)
      toast.success('Анкета с Google Таблицей добавлена')
      if (onKitCreated && data) onKitCreated(data.id)
    } catch (error) {
      logger.error('Ошибка создания анкеты с Google Таблицей:', error)
      toast.error('Не удалось создать анкету')
    } finally {
      setIsCreatingSheet(false)
    }
  }

  const handleCreateFromBriefTemplate = async () => {
    const name = briefName.trim()
    if (!name || !briefTemplateSheetId) return

    setIsCreatingBrief(true)
    try {
      // 1. Create empty form_kit
      const { data: kitData, error: kitError } = await supabase
        .from('form_kits')
        .insert({ project_id: projectId, workspace_id: workspaceId, name })
        .select('id')
        .single()
      if (kitError) throw kitError
      const formKitId = kitData.id

      // 2. Create brief (copy template) in selected folder
      const { data, error } = await supabase.functions.invoke('google-sheets-create-brief', {
        body: {
          workspaceId,
          templateSheetId: briefTemplateSheetId,
          formKitId,
          projectId,
          briefName: name,
          folderId: selectedFolderId,
        },
      })

      if (error) throw error
      if (data?.error) {
        if (data.error === 'Google Drive not connected') {
          toast.error('Google Drive не подключён', {
            description: 'Подключите Google Drive в настройках профиля',
          })
        } else {
          toast.error(data.error)
        }
        return
      }

      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      onOpenChange(false)
      const sharedMsg = data?.sharedWith > 0 ? ` Доступ выдан ${data.sharedWith} участникам.` : ''
      toast.success(`Бриф создан!${sharedMsg}`)
      if (onKitCreated) onKitCreated(formKitId)
    } catch (error) {
      logger.error('Ошибка создания брифа из шаблона:', error)
      toast.error('Не удалось создать бриф')
    } finally {
      setIsCreatingBrief(false)
    }
  }

  const handleCreate = () => {
    if (mode === 'template') {
      handleCreateFromTemplate()
    } else if (googleSheetSubMode === 'existing') {
      handleCreateFromGoogleSheet()
    } else {
      handleCreateFromBriefTemplate()
    }
  }

  const isCreateDisabled =
    mode === 'template'
      ? !selectedTemplateId || createFormKit.isPending
      : googleSheetSubMode === 'existing'
        ? !sheetName.trim() || !sheetLink.trim() || isCreatingSheet
        : !briefName.trim() || !briefTemplateSheetId || isCreatingBrief

  const isPending =
    mode === 'template'
      ? createFormKit.isPending
      : googleSheetSubMode === 'existing'
        ? isCreatingSheet
        : isCreatingBrief

  return {
    mode,
    setMode,
    googleSheetSubMode,
    setGoogleSheetSubMode,
    templates,
    loadingTemplates,
    selectedTemplateId,
    existingKitTemplateIds,
    sheetName,
    setSheetName,
    sheetLink,
    setSheetLink,
    sheetFileName,
    briefName,
    setBriefName,
    briefTemplateLink,
    handleBriefTemplateLinkChange,
    briefTemplateSheetName,
    selectedFolderId,
    setSelectedFolderId,
    googleDriveFolderLink,
    handleTemplateToggle,
    handleCreate,
    isCreateDisabled,
    isPending,
    templateFormIds,
    hasBriefTemplate,
  }
}
