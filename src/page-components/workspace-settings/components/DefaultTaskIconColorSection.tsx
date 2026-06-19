/**
 * DefaultTaskIconColorSection — иконка и цвет по умолчанию для новых задач
 * на уровне воркспейса. Применяются при быстром добавлении задач
 * (QuickAddModal). Сохраняется в workspaces.default_task_icon/accent.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Palette } from 'lucide-react'
import { CardContent } from '@/components/ui/card'
import { SettingsCard } from './SettingsCard'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { workspaceKeys } from '@/hooks/queryKeys'
import { ChatIconColorGrid } from '@/components/messenger/ChatSettingsIconColorPicker'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

type Props = { workspaceId: string }

export function DefaultTaskIconColorSection({ workspaceId }: Props) {
  const { data: workspace } = useWorkspace(workspaceId)
  const queryClient = useQueryClient()

  const icon = workspace?.default_task_icon ?? 'message-square'
  const accent = (workspace?.default_task_accent as ThreadAccentColor) ?? 'blue'

  const saveMutation = useMutation({
    mutationFn: async (patch: Partial<{ default_task_icon: string; default_task_accent: string }>) => {
      const { error } = await supabase.from('workspaces').update(patch).eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
      toast.success('Сохранено')
    },
    onError: () => toast.error('Не удалось сохранить'),
  })

  return (
    <SettingsCard
      title="Иконка и цвет задач по умолчанию"
      description="С какими иконкой и цветом создаются новые задачи через быстрое добавление. У каждой задачи их можно поменять отдельно."
      icon={Palette}
      padded={false}
    >
      <CardContent>
        <ChatIconColorGrid
          accentColor={accent}
          icon={icon}
          onAccentColorChange={(c) => saveMutation.mutate({ default_task_accent: c })}
          onIconChange={(i) => saveMutation.mutate({ default_task_icon: i })}
        />
      </CardContent>
    </SettingsCard>
  )
}
