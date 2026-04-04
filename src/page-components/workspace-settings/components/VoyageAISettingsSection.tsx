/**
 * VoyageAISettingsSection — настройки VoyageAI для AI-поиска по базе знаний.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface VoyageAISettingsSectionProps {
  workspaceId: string
}

export function VoyageAISettingsSection({ workspaceId }: VoyageAISettingsSectionProps) {
  const [voyageApiKey, setVoyageApiKey] = useState('')
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const queryClient = useQueryClient()

  const queryKey = ['workspace-voyageai-settings', workspaceId]

  const { data } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('voyageai_api_key_id')
        .eq('id', workspaceId)
        .single()

      if (error) throw error
      return data as { voyageai_api_key_id: string | null }
    },
    enabled: !!workspaceId,
  })

  const hasVoyageApiKey = !!data?.voyageai_api_key_id

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('set_workspace_voyageai_api_key', {
        workspace_uuid: workspaceId,
        api_key: voyageApiKey.trim(),
      })
      if (error) throw error
    },
    onSuccess: () => {
      setVoyageApiKey('')
      queryClient.invalidateQueries({ queryKey })
      toast.success('VoyageAI ключ сохранён')
    },
    onError: () => {
      toast.error('Ошибка при сохранении VoyageAI ключа')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('delete_workspace_voyageai_api_key', {
        workspace_uuid: workspaceId,
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('VoyageAI ключ удалён')
    },
    onError: () => {
      toast.error('Ошибка при удалении VoyageAI ключа')
    },
  })

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Удалить VoyageAI ключ?',
      description: 'AI-поиск по базе знаний перестанет работать.',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    deleteMutation.mutate()
  }

  const isBusy = saveMutation.isPending || deleteMutation.isPending

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>VoyageAI — AI-поиск по базе знаний</CardTitle>
          <CardDescription>
            Ключ VoyageAI нужен для создания эмбеддингов статей и поиска по ним
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="voyage-api-key">
                API ключ VoyageAI
                {hasVoyageApiKey && (
                  <Badge variant="secondary" className="ml-2">
                    Настроен
                  </Badge>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="voyage-api-key"
                  type="password"
                  value={voyageApiKey}
                  onChange={(e) => setVoyageApiKey(e.target.value)}
                  placeholder={hasVoyageApiKey ? '••••••••••••••••' : 'pa-...'}
                  className="flex-1"
                />
                {hasVoyageApiKey && (
                  <Button
                    variant="outline"
                    onClick={handleDelete}
                    disabled={isBusy}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    Удалить
                  </Button>
                )}
              </div>
              <p className="text-xs text-gray-500">
                Получите ключ на{' '}
                <a
                  href="https://dash.voyageai.com/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  dash.voyageai.com
                </a>
                . Используется модель voyage-3-lite (1024 измерений). Ключ хранится в зашифрованном
                виде.
              </p>
            </div>

            <Button onClick={() => saveMutation.mutate()} disabled={isBusy || !voyageApiKey.trim()}>
              {saveMutation.isPending ? 'Сохранение...' : 'Сохранить VoyageAI ключ'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </>
  )
}
