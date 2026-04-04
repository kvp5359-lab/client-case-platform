/**
 * SendDelaySettingsSection — настройка задержки отправки сообщений.
 * 0 = без задержки, иначе кол-во секунд (1-10).
 */

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useWorkspaceStore } from '@/store/workspaceStore'

interface SendDelaySettingsSectionProps {
  workspaceId: string
}

const DELAY_OPTIONS = [
  { value: '0', label: 'Без задержки' },
  { value: '3', label: '3 секунды' },
  { value: '5', label: '5 секунд' },
  { value: '7', label: '7 секунд' },
  { value: '10', label: '10 секунд' },
]

export function SendDelaySettingsSection({ workspaceId }: SendDelaySettingsSectionProps) {
  const workspace = useWorkspaceStore((s) => s.workspace)
  const refreshWorkspace = useWorkspaceStore((s) => s.refreshWorkspace)
  const queryClient = useQueryClient()

  const currentDelay = ((workspace as Record<string, unknown>)?.send_delay_seconds as number) ?? 0

  const [delay, setDelay] = useState<number>(currentDelay)

  useEffect(() => {
    setDelay(currentDelay)
  }, [currentDelay])

  const hasChanges = delay !== currentDelay

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('workspaces')
        .update({ send_delay_seconds: delay } as Record<string, unknown>)
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      refreshWorkspace()
      queryClient.invalidateQueries({ queryKey: ['workspace-settings', workspaceId] })
      toast.success('Настройки задержки сохранены')
    },
    onError: () => {
      toast.error('Ошибка при сохранении настроек')
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Задержка отправки сообщений</CardTitle>
        <CardDescription>
          После нажатия &laquo;Отправить&raquo; сообщение можно отменить в течение заданного времени
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Задержка</Label>
            <Select value={String(delay)} onValueChange={(v) => setDelay(Number(v))}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELAY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
          >
            {saveMutation.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
