"use client"

import { Switch } from '@/components/ui/switch'
import {
  useSenderNameSettings,
  useUpdateSenderNameSetting,
  type SenderNameChannel,
} from '@/hooks/useWhatsappSettings'

const COL: Record<SenderNameChannel, 'telegram_show_sender_name' | 'wazzup_show_sender_name' | 'waha_show_sender_name'> = {
  telegram: 'telegram_show_sender_name',
  wazzup: 'wazzup_show_sender_name',
  waha: 'waha_show_sender_name',
}

/** Тумблер «показывать имя отправителя» для конкретного канала (уровень воркспейса). */
export function ShowSenderNameSetting({
  workspaceId,
  channel,
}: {
  workspaceId: string
  channel: SenderNameChannel
}) {
  const { data } = useSenderNameSettings(workspaceId)
  const update = useUpdateSenderNameSetting(workspaceId)
  const on = data?.[COL[channel]] ?? false

  return (
    <div className="rounded-lg border px-4 py-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">Показывать имя отправителя</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Перед сообщением подставляется имя сотрудника-автора — клиент видит, кто из
          команды ответил (особенно полезно в группах и при отправке с общего номера).
          Имя берётся из «Имя для мессенджеров» сотрудника, иначе — обычное имя.
        </p>
        {channel === 'telegram' && (
          <p className="text-xs text-amber-600 mt-1">
            ⚠️ Выключение уберёт имя и в группах с ботом-секретарём — там клиент
            перестанет видеть, кто из команды написал.
          </p>
        )}
      </div>
      <Switch
        checked={on}
        disabled={update.isPending}
        onCheckedChange={(v) => update.mutate({ channel, value: v })}
      />
    </div>
  )
}
