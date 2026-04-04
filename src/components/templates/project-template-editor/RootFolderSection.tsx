/**
 * Секция настройки корневой папки Google Drive в редакторе типа проекта.
 * Папки проектов будут создаваться внутри этой корневой папки.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderOpen, ExternalLink, Trash2, Check, X } from 'lucide-react'
import { extractGoogleDriveFolderId, buildGoogleDriveFolderUrl } from '@/utils/googleDrive'

interface RootFolderSectionProps {
  templateId: string | undefined
  rootFolderId: string | null | undefined
  workspaceId: string | undefined
}

export function RootFolderSection({
  templateId,
  rootFolderId,
  workspaceId,
}: RootFolderSectionProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [folderLink, setFolderLink] = useState('')
  const [folderName, setFolderName] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- async effect with isCurrent guard */
  useEffect(() => {
    if (!rootFolderId || !workspaceId) {
      setFolderName(null)
      return
    }
    let cancelled = false
    supabase.functions
      .invoke('google-drive-get-folder-name', { body: { folderId: rootFolderId, workspaceId } })
      .then(({ data, error }) => {
        if (cancelled) return
        setFolderName(!error && data?.name ? data.name : null)
      })
    return () => {
      cancelled = true
    }
  }, [rootFolderId, workspaceId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async (folderId: string | null) => {
      const { error } = await supabase
        .from('project_templates')
        .update({ root_folder_id: folderId })
        .eq('id', templateId ?? '')

      if (error) throw error
    },
    onSuccess: (_, folderId) => {
      queryClient.invalidateQueries({ queryKey: ['project-template', templateId] })
      setIsEditing(false)
      setFolderLink('')
      toast.success(folderId ? 'Корневая папка обновлена' : 'Корневая папка удалена')
    },
    onError: () => {
      toast.error('Не удалось сохранить корневую папку')
    },
  })

  const handleStartEditing = () => {
    setFolderLink(rootFolderId ? buildGoogleDriveFolderUrl(rootFolderId) : '')
    setIsEditing(true)
  }

  const handleSave = () => {
    const folderId = extractGoogleDriveFolderId(folderLink)
    if (!folderId) {
      toast.error('Неверная ссылка на папку Google Drive')
      return
    }
    saveMutation.mutate(folderId)
  }

  const handleRemove = () => {
    saveMutation.mutate(null)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setFolderLink('')
  }

  return (
    <section className="space-y-3 mb-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-muted-foreground" />
          Корневая папка Google Drive
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Папка, внутри которой будут создаваться папки проектов этого типа
        </p>
      </div>

      {!isEditing ? (
        <div className="flex items-center gap-3">
          {rootFolderId ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {folderName || 'Папка подключена'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() =>
                  window.open(
                    buildGoogleDriveFolderUrl(rootFolderId),
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Открыть
              </Button>
              <Button variant="outline" size="sm" onClick={handleStartEditing}>
                Изменить
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={handleRemove}
                disabled={saveMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={handleStartEditing}>
              Указать папку
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={folderLink}
            onChange={(e) => setFolderLink(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            disabled={saveMutation.isPending}
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!folderLink.trim() || saveMutation.isPending}
          >
            <Check className="h-4 w-4 mr-1" />
            Сохранить
          </Button>
        </div>
      )}
    </section>
  )
}
