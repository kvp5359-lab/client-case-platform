"use client"

import {
  MoreHorizontal,
  FileText,
  Sparkles,
  RefreshCw,
  Table2,
  ExternalLink,
  Unlink,
  Trash2,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFormKitSync } from '@/hooks/useFormKitSync'

interface KitMenuProps {
  formKitId: string
  googleSheetId?: string | null
  briefSheetId?: string | null
  projectId: string
  hasBriefTemplate: boolean
  onSummary: () => void
  onAutoFill: () => void
  onSync: () => void
  onCreateBrief: () => void
  onConnectBrief: () => void
  onDisconnectBrief: () => void
  onDelete: () => void
}

export function KitMenu({
  formKitId,
  googleSheetId,
  briefSheetId,
  projectId,
  hasBriefTemplate,
  onSummary,
  onAutoFill,
  onSync,
  onCreateBrief,
  onConnectBrief,
  onDisconnectBrief,
  onDelete,
}: KitMenuProps) {
  const { isSyncing, handleSyncToGoogleSheets } = useFormKitSync({
    formKitId,
    projectId,
    googleSheetId,
  })

  const handleOpenSheet = () => {
    if (googleSheetId) {
      window.open(
        `https://docs.google.com/spreadsheets/d/${googleSheetId}/edit`,
        '_blank',
        'noopener,noreferrer',
      )
    }
  }

  const handleOpenBrief = () => {
    if (briefSheetId) {
      window.open(
        `https://docs.google.com/spreadsheets/d/${briefSheetId}/edit`,
        '_blank',
        'noopener,noreferrer',
      )
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-1 rounded-md text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {briefSheetId ? (
          <>
            <DropdownMenuItem onClick={handleOpenBrief}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Открыть бриф в новой вкладке
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDisconnectBrief} className="text-destructive">
              <Unlink className="h-4 w-4 mr-2" />
              Отключить бриф
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : (
          <>
            {hasBriefTemplate && (
              <DropdownMenuItem onClick={onCreateBrief}>
                <Table2 className="h-4 w-4 mr-2 text-green-600" />
                Создать бриф из шаблона
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onConnectBrief}>
              <ExternalLink className="h-4 w-4 mr-2 text-blue-500" />
              Подключить существующий бриф
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {!briefSheetId && (
          <>
            <DropdownMenuItem onClick={onAutoFill}>
              <Sparkles className="h-4 w-4 mr-2 text-purple-500" />
              Автозаполнение из документа
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSync}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Обновить состав анкеты
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSyncToGoogleSheets()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {isSyncing ? 'Синхронизация...' : 'Синхронизировать с Google Sheets'}
            </DropdownMenuItem>
            {googleSheetId && (
              <DropdownMenuItem onClick={handleOpenSheet}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  className="mr-2 flex-shrink-0"
                >
                  <path
                    d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"
                    fill="#0f9d58"
                  />
                  <path
                    d="M7 7h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"
                    fill="#ffffff"
                    opacity="0.9"
                  />
                </svg>
                Открыть в Google Таблицах
              </DropdownMenuItem>
            )}
          </>
        )}
        <DropdownMenuItem onClick={onSummary}>
          <FileText className="h-4 w-4 mr-2" />
          Сводка по анкете
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2 className="h-4 w-4 mr-2" />
          Удалить анкету
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
