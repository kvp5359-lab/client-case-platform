"use client"

/**
 * Тулбар документов: фильтр, поиск, загрузка, меню
 */

import { memo, useState } from 'react'
import {
  MoreHorizontal,
  FileText,
  FolderOpen,
  Plus,
  Search,
  X,
  Upload,
  Inbox,
  FileDown,
  Link as LinkIcon,
  SlidersHorizontal,
  CloudDownload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { GenerateDocumentDialog } from '@/components/projects/GenerateDocumentDialog'
import type { DocumentKitWithDocuments } from '@/components/documents/types'
import type { CompressAnalysisItem } from '@/components/documents/dialogs/CompressAnalysisDialog'

type DocumentsToolbarProps = {
  filterMode: 'all' | 'action-required'
  setFilterMode: (mode: 'all' | 'action-required') => void
  searchQuery: string
  setSearchQuery: (q: string) => void
  documentKits: DocumentKitWithDocuments[]
  onKitlessDocument?: () => void
  onAddDocument?: (folderId: string) => void
  onOpenAddKitDialog?: () => void
  onOpenCreateKitFromDrive?: () => void
  onSyncAllSources?: () => void
  showHiddenSource: boolean
  setShowHiddenSource: (v: boolean) => void
  generateDocOpen: boolean
  setGenerateDocOpen: (open: boolean) => void
  projectId: string
  workspaceId: string
  compressAnalysisItems: CompressAnalysisItem[]
  setCompressAnalysisOpen: (open: boolean) => void
  /** Принудительно сжимать подписи (например, в TaskPanel → «Документы»).
   *  Если не задан — включается автоматически при открытой боковой панели. */
  compact?: boolean
}

export const DocumentsToolbar = memo(function DocumentsToolbar({
  filterMode,
  setFilterMode,
  searchQuery,
  setSearchQuery,
  documentKits,
  onKitlessDocument,
  onAddDocument,
  onOpenAddKitDialog,
  onOpenCreateKitFromDrive,
  onSyncAllSources,
  showHiddenSource,
  setShowHiddenSource,
  generateDocOpen,
  setGenerateDocOpen,
  projectId,
  workspaceId,
  compressAnalysisItems,
  setCompressAnalysisOpen,
}: DocumentsToolbarProps) {
  const [filterOpen, setFilterOpen] = useState(false)
  // Активен ли какой-либо фильтр (для подсветки кнопки при свёрнутой строке).
  const filterActive = filterMode !== 'all' || showHiddenSource

  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 h-9 min-w-0">
      {/* Кнопка загрузки документов */}
      {(onKitlessDocument || onAddDocument) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 self-stretch flex items-center gap-1.5 px-3 text-sm rounded-lg border border-dashed border-blue-400 text-blue-600 hover:text-blue-700 hover:border-2 hover:border-blue-500 hover:bg-blue-50 hover:px-[11px] transition-all whitespace-nowrap"
            >
              <Upload className="h-3.5 w-3.5" />
              Загрузить
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onKitlessDocument && (
              <DropdownMenuItem onClick={onKitlessDocument}>
                <Inbox className="h-4 w-4 mr-2" />
                Без папки
              </DropdownMenuItem>
            )}
            {onAddDocument &&
              documentKits.map((kit) => {
                const folders = kit.folders || []
                if (folders.length === 0) return null
                return (
                  <div key={kit.id}>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground/60 font-normal py-1">
                      {kit.name}
                    </DropdownMenuLabel>
                    {folders.map((folder) => (
                      <DropdownMenuItem key={folder.id} onClick={() => onAddDocument(folder.id)}>
                        <FolderOpen className="h-4 w-4 mr-2" />
                        {folder.name}
                      </DropdownMenuItem>
                    ))}
                  </div>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Поиск по документам — на мобиле гибкий (flex-1), на десктопе фикс w-48. */}
      <div className="relative flex-1 min-w-0 md:flex-none">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск..."
          className="h-8 w-full md:w-48 pl-8 pr-7 text-sm rounded-lg bg-muted/50 placeholder:text-muted-foreground focus:outline-none focus:bg-muted/80"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Кнопка «Фильтр» — раскрывает строку с фильтрами (тип документов,
          скрытые файлы, в будущем — другие). Точка = фильтр применён. */}
      <button
        type="button"
        onClick={() => setFilterOpen((v) => !v)}
        className={cn(
          'shrink-0 self-stretch flex items-center gap-1.5 px-3 text-sm rounded-lg border transition-colors whitespace-nowrap',
          filterOpen || filterActive
            ? 'border-foreground/30 text-foreground bg-muted/50'
            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
        )}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Фильтр
        {filterActive && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
      </button>

      {(onOpenAddKitDialog || onOpenCreateKitFromDrive) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="shrink-0 self-stretch aspect-square flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {onOpenAddKitDialog && (
              <DropdownMenuItem onClick={onOpenAddKitDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить набор документов
              </DropdownMenuItem>
            )}
            {onOpenCreateKitFromDrive && (
              <DropdownMenuItem onClick={onOpenCreateKitFromDrive}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Из папки Google Drive
              </DropdownMenuItem>
            )}
            {onSyncAllSources && (
              <DropdownMenuItem onClick={onSyncAllSources}>
                <CloudDownload className="h-4 w-4 mr-2" />
                Обновить файлы из источников
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setGenerateDocOpen(true)}>
              <FileText className="h-4 w-4 mr-2" />
              Сгенерировать документ
            </DropdownMenuItem>
            {compressAnalysisItems.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCompressAnalysisOpen(true)}>
                  <FileDown className="h-4 w-4 mr-2" />
                  Анализ сжатия PDF
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      </div>

      {/* Раскрывающаяся строка фильтров */}
      {filterOpen && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 pb-1">
          {/* Тип: все / требуется действие */}
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap',
                filterMode === 'all'
                  ? 'bg-white text-foreground shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Все документы
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('action-required')}
              className={cn(
                'px-3 py-1 text-sm rounded-md transition-colors whitespace-nowrap',
                filterMode === 'action-required'
                  ? 'bg-orange-50 text-orange-600 shadow-[0_1px_3px_rgba(0,0,0,0.2)] font-medium'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Требуется действие
            </button>
          </div>

          {/* Скрытые файлы источника */}
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showHiddenSource}
              onChange={(e) => setShowHiddenSource(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border accent-foreground"
            />
            Показывать скрытые файлы
          </label>
        </div>
      )}

      <GenerateDocumentDialog
        open={generateDocOpen}
        onOpenChange={setGenerateDocOpen}
        projectId={projectId}
        workspaceId={workspaceId}
      />
    </div>
  )
})
