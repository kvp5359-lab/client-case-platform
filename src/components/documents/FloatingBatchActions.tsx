"use client"

/**
 * Плавающая панель пакетных операций
 * Отображается поверх контента при выборе документов
 */

import { useState, useEffect, memo } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Loader2,
  Sparkles,
  Merge,
  FileArchive,
  Folder as FolderIcon,
  FolderInput,
  Download,
  Trash2,
  X,
  Eye,
  EyeOff,
  CircleDot,
  CircleOff,
} from 'lucide-react'
import { safeCssColor } from '@/utils/isValidCssColor'
import { Folder } from './types'
import type { DocumentStatus } from '@/types/entities'
import { useSidePanelStore } from '@/store/sidePanelStore'
import { SendToChatButton } from './SendToChatButton'

type OperationProgress = { current: number; total: number } | null

interface BatchOperations {
  isMerging: boolean
  isCompressing: boolean
  isCheckingBatch: boolean
  isExportingToDisk: boolean
  mergeProgress: OperationProgress
  compressProgress: OperationProgress
  exportProgress: OperationProgress
}

interface BatchPermissions {
  canBatchCheck?: boolean
  canCompress?: boolean
  canMove?: boolean
  canDelete?: boolean
  canDownload?: boolean
}

interface BatchHandlers {
  onClearSelection: () => void
  onBatchCheck: () => void
  onMerge: () => void
  onBatchCompress: () => void
  onBatchMove: (folderId: string | null) => void
  onBatchDelete: () => void
  onBatchHardDelete?: () => void
  onBatchDownload: () => void
  onBatchToggleHidden?: (hide: boolean) => void
  onBatchSetStatus?: (statusId: string | null) => void
  onSendToChat?: (target: 'client' | 'internal' | 'assistant') => void
}

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
              {/* Проверка документов — только с правом canBatchCheck */}
              {canBatchCheck && (
                <>
                  <DropdownMenuItem
                    onClick={onBatchCheck}
                    disabled={selectedCount === 0 || isProcessing}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Проверить документы
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={onMerge} disabled={selectedCount < 2 || isProcessing}>
                <Merge className="h-4 w-4 mr-2" />
                Объединить файлы
                {selectedCount < 2 && (
                  <span className="ml-2 text-xs text-muted-foreground">(мин. 2)</span>
                )}
              </DropdownMenuItem>

              {/* Сжатие PDF — только с правом canCompress */}
              {canCompress && (
                <DropdownMenuItem
                  onClick={onBatchCompress}
                  disabled={selectedCount === 0 || isProcessing}
                >
                  <FileArchive className="h-4 w-4 mr-2" />
                  Сжать PDF
                </DropdownMenuItem>
              )}

              {/* Перемещение в папку — только с правом canMove */}
              {canMove && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={selectedCount === 0 || isProcessing}>
                    <FolderInput className="h-4 w-4 mr-2" />
                    Переместить в папку
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {/* Опция "Нераспределённые" */}
                    <DropdownMenuItem onClick={() => onBatchMove(null)}>
                      <FolderIcon className="h-4 w-4 mr-2 text-muted-foreground" />
                      Нераспределённые
                    </DropdownMenuItem>

                    {folders.length > 0 && <DropdownMenuSeparator />}

                    {/* Список папок */}
                    {folders.map((folder) => (
                      <DropdownMenuItem key={folder.id} onClick={() => onBatchMove(folder.id)}>
                        <FolderIcon className="h-4 w-4 mr-2 text-blue-600" />
                        {folder.name}
                      </DropdownMenuItem>
                    ))}

                    {folders.length === 0 && (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        Нет доступных папок
                      </div>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Установка статуса */}
              {onBatchSetStatus && statuses.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger disabled={selectedCount === 0 || isProcessing}>
                    <CircleDot className="h-4 w-4 mr-2" />
                    Установить статус
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {statuses.map((status) => (
                      <DropdownMenuItem key={status.id} onClick={() => onBatchSetStatus(status.id)}>
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0 mr-2"
                          style={{ backgroundColor: safeCssColor(status.color) }}
                        />
                        {status.name}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => onBatchSetStatus(null)}>
                      <CircleOff className="h-4 w-4 mr-2 text-muted-foreground" />
                      Без статуса
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Удаление — только с правом canDelete */}
              {canDelete && (
                <>
                  <DropdownMenuItem
                    onClick={onBatchDelete}
                    disabled={selectedCount === 0 || isProcessing}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Удалить файлы
                  </DropdownMenuItem>
                  {hasTrashDocumentsSelected && onBatchHardDelete && (
                    <DropdownMenuItem
                      onClick={onBatchHardDelete}
                      disabled={selectedCount === 0 || isProcessing}
                      className="text-destructive focus:text-destructive font-bold"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Удалить файлы навсегда
                    </DropdownMenuItem>
                  )}
                </>
              )}
              {/* Скрыть/показать — только в источнике */}
              {isSourceTab && onBatchToggleHidden && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onBatchToggleHidden(!selectedSourceDocsAllHidden)}
                    disabled={selectedCount === 0 || isProcessing}
                  >
                    {selectedSourceDocsAllHidden ? (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Показать документы
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4 mr-2" />
                        Скрыть документы
                      </>
                    )}
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              {/* Скачивание — только с правом canDownload */}
              {canDownload && (
                <DropdownMenuItem
                  onClick={onBatchDownload}
                  disabled={selectedCount === 0 || isProcessing}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Скачать документы
                </DropdownMenuItem>
              )}
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
