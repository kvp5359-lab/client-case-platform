"use client"

/**
 * Плавающая панель пакетных операций
 * Отображается поверх контента при выборе документов
 *
 * Тонкая обёртка: управляет видимостью и позиционированием,
 * рендерит подкомпоненты из batch-actions/
 */

import { useState, useLayoutEffect, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, X, Bot } from 'lucide-react'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { SendToChatButton } from './SendToChatButton'
import {
  BatchActionsAI,
  BatchActionsMerge,
  BatchActionsMove,
  BatchActionsStatus,
  BatchActionsDelete,
  BatchActionsVisibility,
  BatchActionsDownload,
} from './batch-actions'
import type {
  BatchOperations,
  BatchPermissions,
  BatchHandlers,
} from './batch-actions'
import type { Folder } from './types'
import type { DocumentStatus } from '@/types/entities'

export type { BatchOperations, BatchPermissions, BatchHandlers }

export type FloatingBatchActionsProps = {
  hasSelection: boolean
  selectedCount: number
  hasTrashDocumentsSelected?: boolean
  isSourceTab?: boolean
  selectedSourceDocsAllHidden?: boolean
  folders: Folder[]
  statuses?: DocumentStatus[]
  operations: BatchOperations
  permissions?: BatchPermissions
  handlers: BatchHandlers
}

export const FloatingBatchActions = memo(function FloatingBatchActions({
  hasSelection,
  selectedCount,
  hasTrashDocumentsSelected = false,
  isSourceTab = false,
  selectedSourceDocsAllHidden = false,
  folders,
  statuses = [],
  operations,
  permissions = {},
  handlers,
}: FloatingBatchActionsProps) {
  const {
    isMerging,
    isCompressing,
    isCheckingBatch,
    isExportingToDisk,
    mergeProgress,
    compressProgress,
    exportProgress,
  } = operations

  const {
    canBatchCheck = true,
    canCompress = true,
    canMove = true,
    canDelete = true,
    canDownload = true,
  } = permissions

  const {
    onClearSelection,
    onBatchCheck,
    onMerge,
    onBatchCompress,
    onBatchMove,
    onBatchDelete,
    onBatchHardDelete,
    onBatchDownload,
    onBatchToggleHidden,
    onBatchSetStatus,
    onSendToChat,
  } = handlers
  const panelTab = useSidePanelStore((s) => s.panelTab)
  const panelOpen = panelTab !== null

  // Вычисляем центр области документов (между левым сайдбаром и правой панелью).
  // Используем реальные размеры DOM-элементов и ResizeObserver, чтобы ловить
  // любые изменения: resize окна, ресайз сайдбара, открытие/закрытие правой панели.
  const [leftOffset, setLeftOffset] = useState<string | null>(null)
  useLayoutEffect(() => {
    if (!hasSelection) return
    const compute = () => {
      const sidebarEl = document.querySelector('[data-workspace-sidebar]') as HTMLElement | null
      const sidebarWidth = sidebarEl
        ? sidebarEl.getBoundingClientRect().width
        : (parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10) || 280)
      const sidePanel = document.querySelector('.side-panel') as HTMLElement | null
      const sidePanelRect = sidePanel?.getBoundingClientRect()
      // .side-panel при закрытии получает класс hidden (display:none) → rect.width = 0.
      const rightWidth = sidePanelRect && sidePanelRect.width > 0 ? sidePanelRect.width : 0
      const docAreaCenter = sidebarWidth + (window.innerWidth - sidebarWidth - rightWidth) / 2
      setLeftOffset(`${docAreaCenter}px`)
    }
    compute()
    const ro = new ResizeObserver(compute)
    const sidePanel = document.querySelector('.side-panel') as HTMLElement | null
    if (sidePanel) ro.observe(sidePanel)
    const sidebarEl = document.querySelector('[data-workspace-sidebar]') as HTMLElement | null
    if (sidebarEl) ro.observe(sidebarEl)
    ro.observe(document.body)
    window.addEventListener('resize', compute)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [hasSelection, panelOpen])

  if (!hasSelection) return null

  const isProcessing = isMerging || isCompressing || isCheckingBatch || isExportingToDisk

  return (
    <div
      className="fixed top-2 z-[60] -translate-x-1/2 animate-in slide-in-from-top-5 duration-200 transition-[left] ease-in-out"
      style={{ left: leftOffset ?? '50%', visibility: leftOffset ? 'visible' : 'hidden' }}
    >
      <div className="bg-background border border-border rounded-xl px-5 py-3 flex items-center gap-4 shadow-[0_4px_24px_-2px_rgba(0,0,0,0.18),0_0_0_1px_rgba(0,0,0,0.06)]">
        {/* Текст с количеством выбранных документов */}
        <div className="text-sm font-medium text-foreground">
          Выбрано документов: {selectedCount}
        </div>

        {/* Кнопки "Действия" + "Ассистент" */}
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="default" size="sm" disabled={isProcessing}>
                {isMerging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {mergeProgress &&
                      `Объединение (${mergeProgress.current}/${mergeProgress.total})...`}
                  </>
                ) : isCompressing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {compressProgress &&
                      `Сжатие (${compressProgress.current}/${compressProgress.total})...`}
                  </>
                ) : isCheckingBatch ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Проверка документов...
                  </>
                ) : isExportingToDisk ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {exportProgress &&
                      `Выгрузка (${exportProgress.current}/${exportProgress.total})...`}
                  </>
                ) : (
                  <>Действия</>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <BatchActionsAI
                canBatchCheck={canBatchCheck}
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                onBatchCheck={onBatchCheck}
              />
              <BatchActionsMerge
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                canCompress={canCompress}
                onMerge={onMerge}
                onBatchCompress={onBatchCompress}
              />
              <BatchActionsMove
                canMove={canMove}
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                folders={folders}
                onBatchMove={onBatchMove}
              />
              <BatchActionsStatus
                statuses={statuses}
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                onBatchSetStatus={onBatchSetStatus}
              />
              <BatchActionsDelete
                canDelete={canDelete}
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                hasTrashDocumentsSelected={hasTrashDocumentsSelected}
                onBatchDelete={onBatchDelete}
                onBatchHardDelete={onBatchHardDelete}
              />
              <BatchActionsVisibility
                isSourceTab={isSourceTab}
                selectedSourceDocsAllHidden={selectedSourceDocsAllHidden}
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                onBatchToggleHidden={onBatchToggleHidden}
              />
              <BatchActionsDownload
                canDownload={canDownload}
                selectedCount={selectedCount}
                isProcessing={isProcessing}
                onBatchDownload={onBatchDownload}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          {onSendToChat && panelTab !== 'assistant' && (
            <SendToChatButton
              panelTab={panelTab}
              onSendToChat={onSendToChat}
              isProcessing={isProcessing}
            />
          )}
        </div>

        {/* Открыть ассистента с выбранными документами */}
        {onSendToChat && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSendToChat('assistant')}
            className="h-8 w-8 p-0"
            disabled={isProcessing}
            title="Открыть ассистента с выбранными документами"
          >
            <Bot className="h-4 w-4 text-purple-500" />
          </Button>
        )}

        {/* Кнопка закрытия */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-8 w-8 p-0"
          disabled={isProcessing}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
})
