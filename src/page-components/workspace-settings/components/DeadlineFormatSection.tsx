/**
 * DeadlineFormatSection — настройка отображения сроков на уровне воркспейса.
 *
 * Две независимые опции: формат «близкой» даты (с относительным ярлыком —
 * вчера/сегодня/завтра/послезавтра) и формат «дальней» даты. Применяется
 * везде, где показывается дата срока (чипы задач, доски, поле «Срок»
 * в диалоге создания). Сохраняется в workspaces.deadline_near/far_format.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarClock } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { SettingsCard } from './SettingsCard'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { workspaceKeys } from '@/hooks/queryKeys'
import {
  formatDeadlineDisplay,
  DEFAULT_DEADLINE_NEAR_FORMAT,
  DEFAULT_DEADLINE_FAR_FORMAT,
  type DeadlineNearFormat,
  type DeadlineFarFormat,
} from '@/utils/deadlineUtils'

type Props = { workspaceId: string }

const NEAR_OPTIONS: { value: DeadlineNearFormat; label: string }[] = [
  { value: 'label', label: 'Только ярлык' },
  { value: 'label_numeric', label: 'Ярлык + числовая дата' },
  { value: 'label_text', label: 'Ярлык + текстовая дата' },
]

const FAR_OPTIONS: { value: DeadlineFarFormat; label: string }[] = [
  { value: 'numeric', label: 'Числовая' },
  { value: 'text', label: 'Текстовая' },
  { value: 'text_weekday', label: 'С днём недели' },
]

export function DeadlineFormatSection({ workspaceId }: Props) {
  const { data: workspace } = useWorkspace(workspaceId)
  const queryClient = useQueryClient()

  const near = (workspace?.deadline_near_format as DeadlineNearFormat) ?? DEFAULT_DEADLINE_NEAR_FORMAT
  const far = (workspace?.deadline_far_format as DeadlineFarFormat) ?? DEFAULT_DEADLINE_FAR_FORMAT

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<{ deadline_near_format: string; deadline_far_format: string }>) => {
      const { error } = await supabase.from('workspaces').update(patch).eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
      toast.success('Формат сроков сохранён')
    },
    onError: () => toast.error('Не удалось сохранить формат сроков'),
  })

  // Примеры: близкая дата = сегодня, дальняя = +40 дней (точно без ярлыка).
  const nearExample = formatDeadlineDisplay(new Date(), { near, far })
  const farDate = new Date()
  farDate.setDate(farDate.getDate() + 40)
  const farExample = formatDeadlineDisplay(farDate, { near, far })

  return (
    <SettingsCard
      title="Формат отображения сроков"
      description="Как показывать даты дедлайнов во всём воркспейсе — в задачах, на досках и в поле «Срок». «Близкая» дата — сегодня/завтра/вчера/послезавтра (есть ярлык), «дальняя» — все остальные."
      icon={CalendarClock}
      padded={false}
    >
      <CardContent>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Близкая дата</Label>
              <Select
                value={near}
                onValueChange={(v) => saveMutation.mutate({ deadline_near_format: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NEAR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Дальняя дата</Label>
              <Select
                value={far}
                onValueChange={(v) => saveMutation.mutate({ deadline_far_format: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FAR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Пример: </span>
            <span className="font-medium">{nearExample}</span>
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium">{farExample}</span>
          </div>
        </div>
      </CardContent>
    </SettingsCard>
  )
}
