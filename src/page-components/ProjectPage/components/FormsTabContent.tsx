"use client"

/**
 * Содержимое вкладки "Анкеты"
 * Структура: переключатель режима → список анкет (заголовок + секции)
 *
 * Если у анкеты есть brief_sheet_id — показываем встроенную Google Таблицу.
 * Иначе — показываем FormKitView (стандартные анкеты).
 */

import { useState } from 'react'
import { Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { SummaryDialog } from '@/components/documents'
import { FormKitView } from '@/components/forms/FormKitView'
import { useFormSummary } from '@/hooks/forms/useFormSummary'
import { useSyncFormKit, useDeleteFormKit, type FormKit } from '@/hooks/forms/useFormKitsQuery'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { logger } from '@/utils/logger'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { Project } from '../types'
import { BriefIframe } from './Forms/BriefIframe'
import { KitMenu } from './Forms/KitMenu'
import { CreateBriefDialog } from './Forms/CreateBriefDialog'
import { ConnectBriefDialog } from './Forms/ConnectBriefDialog'
import { useBriefSheetActions } from './Forms/useBriefSheetActions'

type FormsTabContentProps = {
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

  // Свёрнутые анкеты — persist в localStorage по проекту, чтобы сохранялось между сессиями.
  const collapsedStorageKey = `forms-collapsed:${projectId}`
  const [collapsedKitIds, setCollapsedKitIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const raw = window.localStorage.getItem(collapsedStorageKey)
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })
  const toggleKitCollapsed = (kitId: string) => {
    setCollapsedKitIds((prev) => {
      const next = new Set(prev)
      if (next.has(kitId)) next.delete(kitId)
      else next.add(kitId)
      try {
        window.localStorage.setItem(collapsedStorageKey, JSON.stringify([...next]))
      } catch {
        /* quota */
      }
      return next
    })
  }

  const sidePanelOpen = useSidePanelStore((s) => s.panelTab !== null)
  const formSummary = useFormSummary({ workspaceId })
  const syncMutation = useSyncFormKit(projectId)
  const deleteFormKit = useDeleteFormKit(projectId)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  // Логика брифов (Google Sheets) — состояние диалогов + create/connect/disconnect.
  const {
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
  } = useBriefSheetActions({ projectId, workspaceId, project, confirm })

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
      {formKits.map((formKit) => {
        const isCollapsed = collapsedKitIds.has(formKit.id)
        return (
          <div key={formKit.id} className="space-y-2">
            {/* Заголовок анкеты — клик по нему сворачивает/разворачивает */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => toggleKitCollapsed(formKit.id)}
                className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                aria-expanded={!isCollapsed}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                )}
                <h3 className="text-xl text-foreground uppercase tracking-wide font-bold">
                  {formKit.name}
                </h3>
              </button>
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
            {!isCollapsed && (formKit.brief_sheet_id ? (
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
            ))}
          </div>
        )
      })}

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
