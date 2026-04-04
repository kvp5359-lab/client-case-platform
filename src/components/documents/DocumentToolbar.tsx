"use client"

/**
 * Панель инструментов для работы с документами
 */

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Upload,
  Filter,
  MoreVertical,
  Plus,
  Download,
  Trash2,
  FolderInput,
  Loader2,
  Settings,
  FileText,
  FileDown,
} from 'lucide-react'

interface DocumentToolbarProps {
  // Состояния
  allSelected: boolean
  showOnlyUnverified: boolean

  // Состояния загрузки
  isUploading: boolean
  uploadingFilesCount: number

  // Флаги прав доступа
  canAddDocuments?: boolean
  canCreateFolders?: boolean
  canDownloadDocuments?: boolean
  canDeleteDocuments?: boolean
  canManageSettings?: boolean

  // Обработчики
  onSelectAll: () => void
  onAddDocument: () => void
  onFilterToggle: () => void
  onAddFolderFromTemplates: () => void
  onAddFolder: () => void
  onConnectSource: () => void
  onDownloadArchive: () => void
  onDeleteKit: () => void
  onOpenSettings: () => void
  onGenerateSummary?: () => void
  onGenerateDocument?: () => void
}

export function DocumentToolbar({
  // Состояния
  allSelected,
  showOnlyUnverified,

  // Состояния загрузки
  isUploading,
  uploadingFilesCount,

  // Флаги прав доступа
  canAddDocuments = true,
  canCreateFolders = true,
  canDownloadDocuments = true,
  canDeleteDocuments = true,
  canManageSettings = true,

  // Обработчики
  onSelectAll,
  onAddDocument,
  onFilterToggle,
  onAddFolderFromTemplates,
  onAddFolder,
  onConnectSource,
  onDownloadArchive,
  onDeleteKit,
  onOpenSettings,
  onGenerateSummary,
  onGenerateDocument,
}: DocumentToolbarProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      {/* Кнопка "Выбрать все" */}
      <button
        type="button"
        onClick={onSelectAll}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-8 w-8 cursor-pointer ${
          allSelected
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
        }`}
      >
        <Checkbox checked={allSelected} className="pointer-events-none" />
      </button>

      {/* Кнопка "Добавить документы" — только с правом add_documents */}
      {canAddDocuments && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAddDocument}
          disabled={isUploading || uploadingFilesCount > 0}
        >
          {uploadingFilesCount > 0 ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Загрузка ({uploadingFilesCount})...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Добавить документы
            </>
          )}
        </Button>
      )}

      {/* Фильтр "Только непроверенные" */}
      <Button
        variant={showOnlyUnverified ? 'default' : 'outline'}
        size="sm"
        onClick={onFilterToggle}
      >
        <Filter className="h-4 w-4 mr-2" />
        Только непроверенные
      </Button>

      {/* Кнопка настроек набора — только с правом manage_settings */}
      {canManageSettings && (
        <Button variant="outline" size="sm" onClick={onOpenSettings}>
          <Settings className="h-4 w-4" />
        </Button>
      )}

      {/* Меню управления набором */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCreateFolders && (
            <>
              <DropdownMenuItem onClick={onAddFolderFromTemplates}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить папку из шаблонов
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onAddFolder}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить отдельную папку
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {onGenerateSummary && (
            <DropdownMenuItem onClick={onGenerateSummary}>
              <FileText className="h-4 w-4 mr-2" />
              Сводка по документам
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onConnectSource}>
            <FolderInput className="h-4 w-4 mr-2" />
            Подключить источник
          </DropdownMenuItem>
          {onGenerateDocument && (
            <DropdownMenuItem onClick={onGenerateDocument}>
              <FileDown className="h-4 w-4 mr-2" />
              Сгенерировать документ
            </DropdownMenuItem>
          )}
          {canDownloadDocuments && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDownloadArchive}>
                <Download className="h-4 w-4 mr-2" />
                Скачать архив
              </DropdownMenuItem>
            </>
          )}
          {canDeleteDocuments && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDeleteKit}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Удалить набор
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
