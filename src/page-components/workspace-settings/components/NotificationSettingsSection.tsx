/**
 * NotificationSettingsSection — настройка длительности toast-уведомлений о новых сообщениях.
 */

import { useState, useMemo, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { workspaceKeys, workspaceSettingsKeys } from '@/hooks/queryKeys'

interface NotificationSettingsSectionProps {
  workspaceId: string
}

export function NotificationSettingsSection({ workspaceId }: NotificationSettingsSectionProps) {
  const { data: workspace } = useWorkspace(workspaceId)
  const queryClient = useQueryClient()

  const currentDuration = workspace?.notification_toast_duration ?? 5

  // Derive initial values from workspace; re-derive when currentDuration changes
  const derived = useMemo(
    () => ({
      duration: currentDuration === 0 ? 5 : currentDuration,
      infinite: currentDuration === 0,
    }),
    [currentDuration],
  )

  const [duration, setDuration] = useState<number>(derived.duration)
  const [infinite, setInfinite] = useState(derived.infinite)

  // Reset local state when workspace value changes (e.g. after save or workspace switch)
  useEffect(() => {
    setDuration(derived.duration)
    setInfinite(derived.infinite)
  }, [derived])

  const effectiveValue = infinite ? 0 : duration
  const hasChanges = effectiveValue !== currentDuration

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('workspaces')
        .update({ notification_toast_duration: effectiveValue })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
      queryClient.invalidateQueries({
        queryKey: workspaceSettingsKeys.notifications(workspaceId),
      })
      toast.success('Настройки уведомлений сохранены')
    },
    onError: () => {
      toast.error('Ошибка при сохранении настроек')
    },
  })

  const handleDurationChange = (value: string) => {
    const num = parseInt(value, 10)
    if (isNaN(num) || num < 1) {
      setDuration(1)
    } else {
      setDuration(num)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Уведомления мессенджера</CardTitle>
        <CardDescription>
          Сколько времени уведомление о новом сообщении остаётся на экране
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label htmlFor="toast-duration">Длительность (сек)</Label>
                <Input
                  id="toast-duration"
                  type="number"
                  min={1}
                  value={infinite ? '' : duration}
                  onChange={(e) => handleDurationChange(e.target.value)}
                  disabled={infinite}
                  className="w-28"
                  placeholder="5"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="toast-infinite"
                checked={infinite}
                onCheckedChange={(checked) => {
                  setInfinite(!!checked)
                  if (!checked && duration === 0) setDuration(5)
                }}
              />
              <Label htmlFor="toast-infinite" className="text-sm font-normal cursor-pointer">
                Не скрывать автоматически (закрывать вручную)
              </Label>
            </div>
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
