"use client"

/**
 * Логика брифов (Google Sheets) вкладки «Анкеты»: создание, подключение,
 * отключение брифа + состояние диалогов. Вынесено из FormsTabContent, чтобы
 * тело компонента осталось тонким (только режимы отображения + рендер).
 */

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formKitKeys, projectShareableKeys } from '@/hooks/queryKeys'
import { extractGoogleDriveFolderId, extractGoogleSheetsId } from '@/utils/googleDrive'
import { logger } from '@/utils/logger'
import type { FormKit } from '@/hooks/forms/useFormKitsQuery'
import type { ConfirmDialogOptions } from '@/hooks/dialogs/useConfirmDialog'
import type { Project } from '../../types'

export function useBriefSheetActions(params: {
  projectId: string
  workspaceId: string
  project: Project
  confirm: (opts: ConfirmDialogOptions) => Promise<boolean>
}) {
  const { projectId, workspaceId, project, confirm } = params
  const queryClient = useQueryClient()

  const [briefDialog, setBriefDialog] = useState<{
    open: boolean
    formKitId: string
    briefName: string
    templateSheetId: string
  }>({ open: false, formKitId: '', briefName: '', templateSheetId: '' })
  const [isCreatingBrief, setIsCreatingBrief] = useState(false)

  const [connectDialog, setConnectDialog] = useState<{
    open: boolean
    formKitId: string
    sheetLink: string
  }>({ open: false, formKitId: '', sheetLink: '' })
  const [isConnecting, setIsConnecting] = useState(false)

  const [briefTemplateSheetId, setBriefTemplateSheetId] = useState<string | null>(null)

  useEffect(() => {
    if (!project.template_id) return
    let cancelled = false
    supabase
      .from('project_templates')
      .select('brief_template_sheet_id')
      .eq('id', project.template_id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          logger.error('Failed to load brief_template_sheet_id:', error)
          return
        }
        setBriefTemplateSheetId(data?.brief_template_sheet_id ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [project.template_id])

  const handleOpenCreateBrief = (formKit: FormKit) => {
    if (!briefTemplateSheetId) {
      toast.error('Шаблон брифа не настроен в типе проекта')
      return
    }
    setBriefDialog({
      open: true,
      formKitId: formKit.id,
      briefName: `Бриф — ${project.name}`,
      templateSheetId: briefTemplateSheetId,
    })
  }

  const handleCreateBrief = async () => {
    if (!briefDialog.briefName.trim() || !briefDialog.templateSheetId) return

    setIsCreatingBrief(true)
    try {
      const folderId = project.google_drive_folder_link
        ? extractGoogleDriveFolderId(project.google_drive_folder_link)
        : null

      const { data, error } = await supabase.functions.invoke('google-sheets-create-brief', {
        body: {
          workspaceId,
          templateSheetId: briefDialog.templateSheetId,
          formKitId: briefDialog.formKitId,
          projectId,
          briefName: briefDialog.briefName.trim(),
          folderId: folderId || undefined,
        },
      })

      if (error) throw error

      if (data?.error) {
        if (data.error === 'Google Drive not connected') {
          toast.error('Google Drive не подключён', {
            description: 'Подключите Google Drive в настройках для создания брифа',
          })
        } else {
          toast.error(data.error)
        }
        return
      }

      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: projectShareableKeys.byProject(projectId) })
      setBriefDialog({ open: false, formKitId: '', briefName: '', templateSheetId: '' })

      const sharedMsg = data?.sharedWith > 0 ? ` Доступ выдан ${data.sharedWith} участникам.` : ''
      toast.success(`Бриф создан!${sharedMsg}`)
    } catch (error) {
      logger.error('Ошибка создания брифа:', error)
      toast.error('Не удалось создать бриф')
    } finally {
      setIsCreatingBrief(false)
    }
  }

  const handleDisconnectBrief = async (formKit: FormKit) => {
    const ok = await confirm({
      title: 'Отключить бриф?',
      description:
        'Google Таблица не будет удалена, но перестанет отображаться на вкладке Анкеты. Вместо неё появится стандартная анкета.',
      confirmText: 'Отключить',
      variant: 'destructive',
    })
    if (!ok) return

    try {
      const { error } = await supabase.functions.invoke('google-sheets-create-brief', {
        body: {
          action: 'disconnect',
          workspaceId,
          formKitId: formKit.id,
        },
      })

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: projectShareableKeys.byProject(projectId) })
      toast.success('Бриф отключён')
    } catch (error) {
      logger.error('Ошибка отключения брифа:', error)
      toast.error('Не удалось отключить бриф')
    }
  }

  const handleOpenConnectBrief = (formKit: FormKit) => {
    setConnectDialog({ open: true, formKitId: formKit.id, sheetLink: '' })
  }

  const handleConnectBrief = async () => {
    const sheetId = extractGoogleSheetsId(connectDialog.sheetLink)
    if (!sheetId) {
      toast.error('Неверная ссылка на Google Таблицу')
      return
    }

    setIsConnecting(true)
    try {
      const { error } = await supabase
        .from('form_kits')
        .update({ brief_sheet_id: sheetId })
        .eq('id', connectDialog.formKitId)

      if (error) throw error

      queryClient.invalidateQueries({ queryKey: formKitKeys.byProject(projectId) })
      queryClient.invalidateQueries({ queryKey: projectShareableKeys.byProject(projectId) })
      setConnectDialog({ open: false, formKitId: '', sheetLink: '' })
      toast.success('Бриф подключён')
    } catch (error) {
      logger.error('Ошибка подключения брифа:', error)
      toast.error('Не удалось подключить бриф')
    } finally {
      setIsConnecting(false)
    }
  }

  return {
    briefTemplateSheetId,
    briefDialog,
    setBriefDialog,
    isCreatingBrief,
    connectDialog,
    setConnectDialog,
    isConnecting,
    handleOpenCreateBrief,
    handleCreateBrief,
    handleDisconnectBrief,
    handleOpenConnectBrief,
    handleConnectBrief,
  }
}
