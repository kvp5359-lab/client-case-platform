"use client"

/**
 * Содержимое вкладки "Анкеты"
 * Структура: переключатель режима → список анкет (заголовок + секции)
 *
 * Если у анкеты есть brief_sheet_id — показываем встроенную Google Таблицу.
 * Иначе — показываем FormKitView (стандартные анкеты).
 */

import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SummaryDialog } from '@/components/documents'
import { FormKitView } from '@/components/forms/FormKitView'
import { useFormSummary } from '@/hooks/forms/useFormSummary'
import { useSyncFormKit, useDeleteFormKit, type FormKit } from '@/hooks/useFormKitsQuery'
import { formKitKeys } from '@/hooks/queryKeys'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { supabase } from '@/lib/supabase'
import { extractGoogleDriveFolderId, extractGoogleSheetsId } from '@/utils/googleDrive'
import { logger } from '@/utils/logger'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { Project } from '../types'
import { BriefIframe } from './Forms/BriefIframe'
import { KitMenu } from './Forms/KitMenu'
import { CreateBriefDialog } from './Forms/CreateBriefDialog'
import { ConnectBriefDialog } from './Forms/ConnectBriefDialog'

interface FormsTabContentProps {
  formKits: FormKit[]
  projectId: string
  workspaceId: string
  project: Project
  canAddForms: boolean
  onAddFormKit: () => void
}

export function FormsTabContent({
  formKits,
  projectId,
  workspaceId,
  project,
  canAddForms,
  onAddFormKit,
}: FormsTabContentProps) {
  const [filterMode, setFilterMode] = useState<'all' | 'action-required'>('all')
  const [autoFillKitId, setAutoFillKitId] = useState<string | null>(null)

  const sidePanelOpen = useSidePanelStore((s) => s.panelTab !== null)
  const formSummary = useFormSummary({ workspaceId })
  const syncMutation = useSyncFormKit(projectId)
  const deleteFormKit = useDeleteFormKit(projectId)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Brief creation dialog state
  const [briefDialog, setBriefDialog] = useState<{
    open: boolean
    formKitId: string
    briefName: string
    templateSheetId: string
  }>({ open: false, formKitId: '', briefName: '', templateSheetId: '' })
  const [isCreatingBrief, setIsCreatingBrief] = useState(false)

  // Connect existing brief dialog state
  const [connectDialog, setConnectDialog] = useState<{
    open: boolean
    formKitId: string
    sheetLink: string
  }>({ open: false, formKitId: '', sheetLink: '' })
  const [isConnecting, setIsConnecting] = useState(false)
  const queryClient = useQueryClient()

  // Get the brief template sheet ID from the project's template
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

  const handleSyncFormKit = async (kit: FormKit) => {
    const ok = await confirm({
      title: `Обновить состав анкеты «${kit.name}»?`,
      description:
        'Секции и поля анкеты будут обновлены в соответствии с текущим шаблоном. Заполненные значения останутся без изменений.',
      confirmText: 'Обновить',
    })
    if (!ok) return

    try {
      await syncMutation.mutateAsync(kit.id)
      toast.success('Состав анкеты обновлён')
    } catch (error) {
      logger.error('Ошибка синхронизации анкеты:', error)
    }
  }

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
      toast.success('Бриф отключён')
    } catch (error) {
      logger.error('Ошибка отключения брифа:', error)
      toast.error('Не удалось отключить бриф')
    }
  }

  const handleDeleteFormKit = async (formKit: FormKit) => {
    const ok = await confirm({
      title: `Удалить анкету «${formKit.name}»?`,
      description: 'Все заполненные данные анкеты будут удалены безвозвратно.',
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return

    try {
      await deleteFormKit.mutateAsync(formKit.id)
      toast.success('Анкета удалена')
    } catch {
      // Ошибка обрабатывается в хуке useDeleteFormKit
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
      setConnectDialog({ open: false, formKitId: '', sheetLink: '' })
      toast.success('Бриф подключён')
    } catch (error) {
      logger.error('Ошибка подключения брифа:', error)
      toast.error('Не удалось подключить бриф')
    } finally {
      setIsConnecting(false)
    }
  }

  if (formKits.length === 0) {
    return (
      <div className="rounded-lg border p-12">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-2">Анкеты</h3>
          <p className="text-muted-foreground mb-4">Пока нет добавленных анкет. Создайте первую!</p>
          {canAddForms && (
            <Button onClick={onAddFormKit}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить анкету
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Check if ANY formKit has a brief (to hide filter when showing iframe)
  const hasBriefs = formKits.some((fk) => fk.brief_sheet_id)
  const hasNonBriefs = formKits.some((fk) => !fk.brief_sheet_id)

  return (
    <div className={cn('space-y-4', !sidePanelOpen && !hasBriefs && 'max-w-[789px]')}>
      {/* Переключатель режима — только если есть стандартные анкеты */}
      {hasNonBriefs && (
        <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              filterMode === 'all'
                ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Все поля
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('action-required')}
            className={cn(
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              filterMode === 'action-required'
                ? 'bg-orange-50 text-orange-600 shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            Только незаполненные
          </button>
        </div>
      )}

      {/* Список анкет */}
      {formKits.map((formKit) => (
        <div key={formKit.id} className="space-y-2">
          {/* Заголовок анкеты */}
          <div className="flex items-center gap-3">
            <h3 className="text-xl text-foreground uppercase tracking-wide font-bold">
              {formKit.name}
            </h3>
            <KitMenu
              formKitId={formKit.id}
              googleSheetId={formKit.google_sheet_id}
              briefSheetId={formKit.brief_sheet_id}
              projectId={projectId}
              hasBriefTemplate={!!briefTemplateSheetId}
              onSummary={() => formSummary.generateSummary(formKit.id, formKit.name)}
              onAutoFill={() => setAutoFillKitId(formKit.id)}
              onSync={() => handleSyncFormKit(formKit)}
              onCreateBrief={() => handleOpenCreateBrief(formKit)}
              onConnectBrief={() => handleOpenConnectBrief(formKit)}
              onDisconnectBrief={() => handleDisconnectBrief(formKit)}
              onDelete={() => handleDeleteFormKit(formKit)}
            />
          </div>

          {/* Содержимое: iframe с Google Таблицей или стандартная анкета */}
          {formKit.brief_sheet_id ? (
            <BriefIframe briefSheetId={formKit.brief_sheet_id} />
          ) : (
            <FormKitView
              formKitId={formKit.id}
              projectId={projectId}
              workspaceId={workspaceId}
              filterMode={filterMode}
              autoFillOpen={autoFillKitId === formKit.id}
              onAutoFillClose={() => setAutoFillKitId(null)}
            />
          )}
        </div>
      ))}

      <SummaryDialog
        open={formSummary.summaryDialogOpen}
        onOpenChange={formSummary.setSummaryDialogOpen}
        text={formSummary.summaryText}
        loading={formSummary.summaryLoading}
        copied={formSummary.copied}
        onCopy={formSummary.handleCopySummary}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      <CreateBriefDialog
        open={briefDialog.open}
        briefName={briefDialog.briefName}
        isCreating={isCreatingBrief}
        onBriefNameChange={(name) => setBriefDialog((d) => ({ ...d, briefName: name }))}
        onClose={() => setBriefDialog((d) => ({ ...d, open: false }))}
        onSubmit={handleCreateBrief}
      />

      <ConnectBriefDialog
        open={connectDialog.open}
        sheetLink={connectDialog.sheetLink}
        isConnecting={isConnecting}
        onSheetLinkChange={(link) => setConnectDialog((d) => ({ ...d, sheetLink: link }))}
        onClose={() => setConnectDialog((d) => ({ ...d, open: false }))}
        onSubmit={handleConnectBrief}
      />
    </div>
  )
}
