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
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { FolderOpen, ExternalLink, Trash2, Check, X } from 'lucide-react'
import { extractGoogleDriveFolderId, buildGoogleDriveFolderUrl } from '@/utils/googleDrive'
import { projectTemplateKeys } from '@/hooks/queryKeys'
import { FOLDER_NAME_VARIABLES, expandFolderNameTemplate } from '@/lib/folderNameTemplate'

type RootFolderSectionProps = {
  templateId: string | undefined
  rootFolderId: string | null | undefined
  workspaceId: string | undefined
  folderNameTemplate: string | null | undefined
  folderNameReplaceSpaces: boolean | undefined
}

/** Пример значений для живого превью шаблона имени папки. */
const PREVIEW_VARS = {
  project_name: 'Иван Петров',
  contact_name: 'Иван Петров',
  description: 'ВНЖ Испания',
  short_id: 'PR-42',
  template_name: 'Бизнес-план',
  created_at: undefined,
}

export function RootFolderSection({
  templateId,
  rootFolderId,
  workspaceId,
  folderNameTemplate,
  folderNameReplaceSpaces,
}: RootFolderSectionProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [folderLink, setFolderLink] = useState('')
  const [folderName, setFolderName] = useState<string | null>(null)
  const [nameTemplate, setNameTemplate] = useState(folderNameTemplate ?? '')
  const [replaceSpaces, setReplaceSpaces] = useState(folderNameReplaceSpaces ?? true)

  // Синхронизация локального стейта при загрузке/смене шаблона (props приходят
  // асинхронно после загрузки шаблона проекта).
  /* eslint-disable react-hooks/set-state-in-effect -- sync from async-loaded props */
  useEffect(() => {
    setNameTemplate(folderNameTemplate ?? '')
  }, [folderNameTemplate])
  useEffect(() => {
    setReplaceSpaces(folderNameReplaceSpaces ?? true)
  }, [folderNameReplaceSpaces])
  /* eslint-enable react-hooks/set-state-in-effect */

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
      // Инвалидация по префиксу захватит и detail(), и detailFull() —
      // обе формы шаблона обновятся в ProjectPage и в редакторе одновременно.
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
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

  const saveNameTemplate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('project_templates')
        .update({
          folder_name_template: nameTemplate.trim() || null,
          folder_name_replace_spaces: replaceSpaces,
        })
        .eq('id', templateId ?? '')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectTemplateKeys.detail(templateId) })
      toast.success('Шаблон имени папки сохранён')
    },
    onError: () => toast.error('Не удалось сохранить шаблон имени'),
  })

  const insertToken = (token: string) => setNameTemplate((t) => (t ? `${t}${token}` : token))

  const namePreview = nameTemplate.trim()
    ? expandFolderNameTemplate(nameTemplate, PREVIEW_VARS, replaceSpaces)
    : 'БП_2026.04.18_Иван_Петров (по умолчанию)'

  const nameTemplateDirty =
    nameTemplate.trim() !== (folderNameTemplate ?? '').trim() ||
    replaceSpaces !== (folderNameReplaceSpaces ?? true)

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

      {/* Шаблон имени создаваемой папки проекта */}
      <div className="pt-4 mt-2 border-t space-y-2">
        <div>
          <h3 className="text-sm font-semibold">Шаблон имени папки проекта</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Имя папки, которая создаётся для нового проекта. Вставьте переменные —
            они заменятся данными проекта. Пусто — имя по умолчанию.
          </p>
        </div>

        <Input
          value={nameTemplate}
          onChange={(e) => setNameTemplate(e.target.value)}
          placeholder="БП_{date}_{project_name}"
        />

        <div className="flex flex-wrap gap-1">
          {FOLDER_NAME_VARIABLES.map((v) => (
            <button
              key={v.token}
              type="button"
              onClick={() => insertToken(v.token)}
              title={v.label}
              className="text-[11px] px-1.5 py-0.5 rounded border bg-muted/50 hover:bg-muted text-muted-foreground font-mono transition-colors"
            >
              {v.token}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="folder-replace-spaces"
            checked={replaceSpaces}
            onCheckedChange={(c) => setReplaceSpaces(c === true)}
          />
          <Label htmlFor="folder-replace-spaces" className="text-sm cursor-pointer">
            Заменять пробелы нижним подчёркиванием
          </Label>
        </div>

        <p className="text-xs text-muted-foreground">
          Превью: <span className="font-mono text-foreground">{namePreview}</span>
        </p>

        <Button
          size="sm"
          onClick={() => saveNameTemplate.mutate()}
          disabled={!nameTemplateDirty || saveNameTemplate.isPending}
        >
          <Check className="h-4 w-4 mr-1" />
          Сохранить шаблон имени
        </Button>
      </div>
    </section>
  )
}
