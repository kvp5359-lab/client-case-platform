"use client"

import { useState, useEffect } from 'react'
import { FolderOpen, Loader2, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { extractGoogleDriveFolderId } from '@/utils/googleDrive'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'

interface DriveFolder {
  id: string
  name: string
}

interface BriefTemplateStepProps {
  briefName: string
  onBriefNameChange: (value: string) => void
  briefTemplateLink: string
  onBriefTemplateLinkChange: (value: string) => void
  briefTemplateSheetName: string | null
  selectedFolderId: string | null
  onSelectFolder: (folderId: string | null) => void
  googleDriveFolderLink: string | null | undefined
  workspaceId: string
}

export function BriefTemplateStep({
  briefName,
  onBriefNameChange,
  briefTemplateLink,
  onBriefTemplateLinkChange,
  briefTemplateSheetName,
  selectedFolderId,
  onSelectFolder,
  googleDriveFolderLink,
  workspaceId,
}: BriefTemplateStepProps) {
  const [folders, setFolders] = useState<DriveFolder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [rootName, setRootName] = useState<string | null>(null)

  const projectFolderId = googleDriveFolderLink
    ? extractGoogleDriveFolderId(googleDriveFolderLink)
    : null

  useEffect(() => {
    if (projectFolderId && !loaded) {
      loadFolders()
      // Load root folder name
      supabase.functions
        .invoke('google-drive-get-folder-name', {
          body: { folderId: projectFolderId, workspaceId },
        })
        .then(({ data, error }) => {
          if (!error && data?.name) setRootName(data.name)
        })
    }
  }, [projectFolderId]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFolders = async () => {
    if (!projectFolderId) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-create-folder', {
        body: { action: 'list', workspaceId, folderId: projectFolderId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setFolders(data?.folders || [])
      setLoaded(true)
      // Auto-select root
      onSelectFolder(projectFolderId)
    } catch (error) {
      logger.error('Failed to load folders:', error)
      toast.error('Не удалось загрузить список папок')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Template sheet link */}
      <div className="space-y-2">
        <Label htmlFor="brief-tpl-link">Ссылка на таблицу-шаблон</Label>
        <Input
          id="brief-tpl-link"
          value={briefTemplateLink}
          onChange={(e) => onBriefTemplateLinkChange(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
        />
        {briefTemplateSheetName && (
          <p className="text-xs text-brand-600 font-medium">{briefTemplateSheetName}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Будет создана копия этой таблицы. Можно вставить другую ссылку.
        </p>
      </div>

      {/* Brief name */}
      <div className="space-y-2">
        <Label htmlFor="brief-tpl-name">Название копии</Label>
        <Input
          id="brief-tpl-name"
          value={briefName}
          onChange={(e) => onBriefNameChange(e.target.value)}
          placeholder="Бриф — Название проекта"
        />
      </div>

      {!projectFolderId ? (
        <p className="text-xs text-muted-foreground">
          К проекту не подключена папка Google Drive — бриф будет создан в корне вашего диска
        </p>
      ) : (
        <div className="space-y-2">
          <Label>Папка на Google Drive</Label>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка папок...
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto space-y-1 rounded-md border p-2">
              {/* Root folder */}
              <button
                type="button"
                onClick={() => onSelectFolder(projectFolderId)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors',
                  selectedFolderId === projectFolderId
                    ? 'bg-amber-50 text-foreground font-medium'
                    : 'hover:bg-muted/50 text-muted-foreground',
                )}
              >
                <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  📁 Корневая папка проекта{rootName ? ` (${rootName})` : ''}
                </span>
                {selectedFolderId === projectFolderId && (
                  <Check className="h-3.5 w-3.5 ml-auto text-amber-600 flex-shrink-0" />
                )}
              </button>

              {/* Subfolders */}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  onClick={() => onSelectFolder(folder.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors pl-7',
                    selectedFolderId === folder.id
                      ? 'bg-amber-50 text-foreground font-medium'
                      : 'hover:bg-muted/50 text-muted-foreground',
                  )}
                >
                  <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate">{folder.name}</span>
                  {selectedFolderId === folder.id && (
                    <Check className="h-3.5 w-3.5 ml-auto text-amber-600 flex-shrink-0" />
                  )}
                </button>
              ))}

              {folders.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-1">Нет вложенных папок</p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Копия будет создана в выбранной папке</p>
        </div>
      )}
    </div>
  )
}
