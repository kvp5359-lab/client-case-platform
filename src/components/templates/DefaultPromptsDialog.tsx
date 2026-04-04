/**
 * Диалог настройки промптов по умолчанию для workspace.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useWorkspaceStore } from '@/store/workspaceStore'

interface DefaultPromptsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string | undefined
}

export function DefaultPromptsDialog({
  open,
  onOpenChange,
  workspaceId,
}: DefaultPromptsDialogProps) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace)
  const [defaultNamingPrompt, setDefaultNamingPrompt] = useState('')
  const [defaultCheckPrompt, setDefaultCheckPrompt] = useState('')
  const [savingDefaults, setSavingDefaults] = useState(false)

  const handleOpen = (v: boolean) => {
    if (v) {
      setDefaultNamingPrompt(workspace?.default_ai_naming_prompt || '')
      setDefaultCheckPrompt(workspace?.default_ai_check_prompt || '')
    }
    onOpenChange(v)
  }

  const saveDefaultPrompts = async () => {
    if (!workspaceId) return
    setSavingDefaults(true)
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({
          default_ai_naming_prompt: defaultNamingPrompt || null,
          default_ai_check_prompt: defaultCheckPrompt || null,
        })
        .eq('id', workspaceId)
      if (error) throw error
      await refreshWorkspace()
      onOpenChange(false)
      toast.success('Промпты по умолчанию сохранены')
    } catch {
      toast.error('Не удалось сохранить промпты')
    } finally {
      setSavingDefaults(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Промпты по умолчанию</DialogTitle>
          <DialogDescription>
            Эти промпты используются для проверки документов, если у папки не указаны собственные
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <Label htmlFor="default_naming_prompt">Промпт для названия документа</Label>
            <Textarea
              id="default_naming_prompt"
              value={defaultNamingPrompt}
              onChange={(e) => setDefaultNamingPrompt(e.target.value)}
              placeholder="Промпт для генерации вариантов названия документа"
              rows={8}
              className="min-h-[200px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="default_check_prompt">Промпт для проверки документа</Label>
            <Textarea
              id="default_check_prompt"
              value={defaultCheckPrompt}
              onChange={(e) => setDefaultCheckPrompt(e.target.value)}
              placeholder="Промпт для проверки содержимого документа"
              rows={8}
              className="min-h-[200px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={saveDefaultPrompts} disabled={savingDefaults}>
            {savingDefaults ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
