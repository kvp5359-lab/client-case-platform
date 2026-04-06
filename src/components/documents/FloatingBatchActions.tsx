"use client"

/**
 * Плавающая панель пакетных операций
 * Отображается поверх контента при выборе документов
 *
 * Тонкая обёртка: управляет видимостью и позиционированием,
 * рендерит подкомпоненты из batch-actions/
 */

import { useState, useEffect, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, X } from 'lucide-react'
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

export interface FloatingBatchActionsProps {
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

  // Вычисляем центр области документов (между левым сайдбаром и правой панелью)
  const [leftOffset, setLeftOffset] = useState('50%')
  useEffect(() => {
    const compute = () => {
      const sidebarWidth = parseInt(localStorage.getItem('sidebarWidth') ?? '280', 10) || 280
      const rightWidth = panelOpen ? window.innerWidth * 0.45 : 0
      const docAreaCenter = sidebarWidth + (window.innerWidth - sidebarWidth - rightWidth) / 2
      setLeftOffset(`${docAreaCenter}px`)
    }
    compute()
    let timer: ReturnType<typeof setTimeout>
    const debouncedCompute = () => {
      clearTimeout(timer)
      timer = setTimeout(compute, 150)
    }
    window.addEventListener('resize', debouncedCompute)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', debouncedCompute)
    }
  }, [panelOpen])

  if (!hasSelection) return null

  const isProcessing = isMerging || isCompressing || isCheckingBatch || isExportingToDisk

  return (
    <div
      className="fixed top-2 z-50 -translate-x-1/2 animate-in slide-in-from-top-5 duration-200 transition-[left] ease-in-out"
      style={{ left: leftOffset }}
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

          {onSendToChat && (
            <SendToChatButton
              panelTab={panelTab}
              onSendToChat={onSendToChat}
              isProcessing={isProcessing}
            />
          )}
        </div>

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
