/**
 * Секция настройки шаблона брифа (Google Sheets) в редакторе типа проекта
 */

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table2, ExternalLink, Trash2, Check, X } from 'lucide-react'
import { extractGoogleSheetsId } from '@/utils/googleDrive'

interface BriefTemplateSectionProps {
  templateId: string | undefined
  briefTemplateSheetId: string | null | undefined
  workspaceId: string | undefined
}

export function BriefTemplateSection({
  templateId,
  briefTemplateSheetId,
  workspaceId,
}: BriefTemplateSectionProps) {
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [sheetLink, setSheetLink] = useState('')
  const [sheetName, setSheetName] = useState<string | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect -- async effect with isCurrent guard */
  useEffect(() => {
    if (!briefTemplateSheetId || !workspaceId) {
      setSheetName(null)
      return
    }
    let cancelled = false
    supabase.functions
      .invoke('google-drive-get-folder-name', {
        body: { folderId: briefTemplateSheetId, workspaceId },
      })
      .then(({ data, error }) => {
        if (cancelled) return
        setSheetName(!error && data?.name ? data.name : null)
      })
    return () => {
      cancelled = true
    }
  }, [briefTemplateSheetId, workspaceId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async (sheetId: string | null) => {
      const { error } = await supabase
        .from('project_templates')
        .update({ brief_template_sheet_id: sheetId })
        .eq('id', templateId ?? '')

      if (error) throw error
    },
    onSuccess: (_, sheetId) => {
      queryClient.invalidateQueries({ queryKey: ['project-template', templateId] })
      setIsEditing(false)
      setSheetLink('')
      toast.success(sheetId ? 'Шаблон брифа обновлён' : 'Шаблон брифа удалён')
    },
    onError: () => {
      toast.error('Не удалось сохранить шаблон брифа')
    },
  })

  const handleStartEditing = () => {
    setSheetLink(
      briefTemplateSheetId
        ? `https://docs.google.com/spreadsheets/d/${briefTemplateSheetId}/edit`
        : '',
    )
    setIsEditing(true)
  }

  const handleSave = () => {
    const sheetId = extractGoogleSheetsId(sheetLink)
    if (!sheetId) {
      toast.error('Неверная ссылка на Google Таблицу')
      return
    }
    saveMutation.mutate(sheetId)
  }

  const handleRemove = () => {
    saveMutation.mutate(null)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setSheetLink('')
  }

  return (
    <section className="space-y-3 mb-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Table2 className="w-5 h-5 text-muted-foreground" />
          Шаблон брифа (Google Таблица)
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ссылка на Google Таблицу-шаблон, из которой будут создаваться брифы для клиентов
        </p>
      </div>

      {!isEditing ? (
        <div className="flex items-center gap-3">
          {briefTemplateSheetId ? (
            <>
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-sm text-muted-foreground truncate">
                  {sheetName || 'Шаблон подключён'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="flex-shrink-0"
                onClick={() =>
                  window.open(
                    `https://docs.google.com/spreadsheets/d/${briefTemplateSheetId}/edit`,
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
              Указать шаблон
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            value={sheetLink}
            onChange={(e) => setSheetLink(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
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
            disabled={!sheetLink.trim() || saveMutation.isPending}
          >
            <Check className="h-4 w-4 mr-1" />
            Сохранить
          </Button>
        </div>
      )}
    </section>
  )
}
