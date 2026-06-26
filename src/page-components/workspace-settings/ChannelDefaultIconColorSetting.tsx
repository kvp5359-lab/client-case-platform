"use client"

/**
 * ChannelDefaultIconColorSetting — иконка и цвет по умолчанию для НОВЫХ чатов
 * одного канала (Telegram-группа / Личный Telegram / WhatsApp / Email).
 *
 * Хранится в workspaces.channel_defaults (jsonb) под ключом канала. При
 * автосоздании треда (webhook/RPC/mtproto) значение КОПИРУЕТСЯ в поля
 * project_threads.icon/accent_color — дальше тред живёт независимо, ручная
 * смена иконки/цвета у конкретного чата работает как раньше.
 *
 * Фолбэк здесь дублирует SQL-хелпер resolve_channel_default — должны совпадать.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Palette } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useWorkspace } from '@/hooks/useWorkspace'
import { workspaceKeys } from '@/hooks/queryKeys'
import { ChatIconColorGrid } from '@/components/messenger/ChatSettingsIconColorPicker'
import type { ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'

export type ChannelDefaultKey = 'telegram' | 'telegram_personal' | 'wazzup' | 'email'

const FALLBACK: Record<ChannelDefaultKey, { icon: string; accent_color: ThreadAccentColor }> = {
  telegram: { icon: 'telegram', accent_color: 'blue' },
  telegram_personal: { icon: 'telegram', accent_color: 'blue' },
  wazzup: { icon: 'whatsapp', accent_color: 'emerald' },
  email: { icon: 'mail', accent_color: 'rose' },
}

type ChannelEntry = { icon?: string; accent_color?: string }
type ChannelDefaultsMap = Record<string, ChannelEntry | undefined>

type Props = {
  workspaceId: string
  channelKey: ChannelDefaultKey
  /** Доп. подпись канала в заголовке, напр. «Telegram-группа». */
  title?: string
}

export function ChannelDefaultIconColorSetting({ workspaceId, channelKey, title }: Props) {
  const { data: workspace } = useWorkspace(workspaceId)
  const queryClient = useQueryClient()

  const map = (workspace?.channel_defaults as ChannelDefaultsMap | null) ?? {}
  const current = map[channelKey] ?? {}
  const fb = FALLBACK[channelKey]
  const icon = current.icon || fb.icon
  const accent = (current.accent_color as ThreadAccentColor) || fb.accent_color

  const saveMutation = useMutation({
    mutationFn: async (patch: ChannelEntry) => {
      const base = (workspace?.channel_defaults as ChannelDefaultsMap | null) ?? {}
      const next: ChannelDefaultsMap = {
        ...base,
        [channelKey]: { icon, accent_color: accent, ...patch },
      }
      const { error } = await supabase
        .from('workspaces')
        .update({ channel_defaults: next })
        .eq('id', workspaceId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })
      toast.success('Сохранено')
    },
    onError: () => toast.error('Не удалось сохранить'),
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Palette className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <CardTitle className="text-base">
              Иконка и цвет новых чатов{title ? ` — ${title}` : ''}
            </CardTitle>
            <CardDescription className="mt-0.5">
              С какими иконкой и цветом создаются новые чаты этого канала. У каждого чата их
              можно изменить отдельно — настройка задаёт только стартовое значение.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ChatIconColorGrid
          accentColor={accent}
          icon={icon}
          onAccentColorChange={(c) => saveMutation.mutate({ accent_color: c })}
          onIconChange={(i) => saveMutation.mutate({ icon: i })}
        />
      </CardContent>
    </Card>
  )
}
