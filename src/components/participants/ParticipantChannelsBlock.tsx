"use client"

/**
 * Блок «Каналы связи» в карточке участника.
 *
 * Показывает все participant_channels участника, позволяет добавлять,
 * удалять и помечать «основной» (primary) канал каждого типа. Текстовая
 * подпись (label) опциональна — для пометки «рабочий», «личный» и т.п.
 *
 * Старые поля participants.email/phone/telegram_user_id пока существуют
 * параллельно (см. ТЗ CRM-фрейма раздел 3 — миграция UI поэтапная).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, Phone, Send, Star, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useParticipantChannels,
  useCreateParticipantChannel,
  useDeleteParticipantChannel,
  useSetPrimaryChannel,
  type ParticipantChannel,
} from '@/hooks/useParticipantChannels'

interface Props {
  participantId: string
  workspaceId: string
}

const CHANNEL_TYPE_LABELS: Record<string, string> = {
  email: 'Email',
  phone: 'Телефон',
  telegram: 'Telegram',
}

const CHANNEL_TYPE_PLACEHOLDERS: Record<string, string> = {
  email: 'email@example.com',
  phone: '+7 (999) 123-45-67',
  telegram: 'Telegram ID (числовой) или @username',
}

function ChannelIcon({ type, className }: { type: string; className?: string }) {
  if (type === 'email') return <Mail className={className} />
  if (type === 'phone') return <Phone className={className} />
  if (type === 'telegram') return <Send className={className} />
  return null
}

export function ParticipantChannelsBlock({ participantId, workspaceId }: Props) {
  const { data: channels = [], isLoading } = useParticipantChannels(participantId)
  const createMut = useCreateParticipantChannel()
  const deleteMut = useDeleteParticipantChannel()
  const primaryMut = useSetPrimaryChannel()

  // Локальное состояние формы добавления нового канала
  const [adding, setAdding] = useState(false)
  const [newType, setNewType] = useState<string>('email')
  const [newValue, setNewValue] = useState('')
  const [newLabel, setNewLabel] = useState('')

  function resetForm() {
    setAdding(false)
    setNewValue('')
    setNewLabel('')
    setNewType('email')
  }

  async function handleAdd() {
    const value = newValue.trim()
    if (!value) return
    try {
      await createMut.mutateAsync({
        participant_id: participantId,
        workspace_id: workspaceId,
        channel_type: newType,
        external_id: value,
        label: newLabel.trim() || null,
        // Если этого типа ещё нет — делаем primary автоматически
        is_primary: !channels.some((c) => c.channel_type === newType),
      })
      resetForm()
      toast.success('Канал добавлен')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Не удалось добавить канал'
      // Уникальность ловим по сообщению Postgres'а
      if (message.includes('duplicate') || message.includes('participant_channels_unique')) {
        toast.error('Такой канал уже привязан к участнику в этом воркспейсе')
      } else {
        toast.error(message)
      }
    }
  }

  async function handleDelete(channel: ParticipantChannel) {
    if (!confirm(`Удалить канал «${channel.external_id}»?`)) return
    try {
      await deleteMut.mutateAsync(channel.id)
      toast.success('Канал удалён')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось удалить канал')
    }
  }

  async function handleSetPrimary(channel: ParticipantChannel) {
    if (channel.is_primary) return
    try {
      await primaryMut.mutateAsync({
        id: channel.id,
        participant_id: channel.participant_id,
        channel_type: channel.channel_type,
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось обновить')
    }
  }

  // Группируем каналы по типу для удобства отображения
  const grouped = channels.reduce<Record<string, ParticipantChannel[]>>((acc, ch) => {
    if (!acc[ch.channel_type]) acc[ch.channel_type] = []
    acc[ch.channel_type]!.push(ch)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Каналы связи</Label>
        {!adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
            disabled={isLoading}
          >
            <Plus className="size-4 mr-1" />
            Добавить
          </Button>
        )}
      </div>

      {channels.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">Каналы не привязаны.</p>
      )}

      {/* Список существующих каналов, сгруппированных по типу */}
      <div className="space-y-3">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type} className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <ChannelIcon type={type} className="size-3.5" />
              {CHANNEL_TYPE_LABELS[type] ?? type}
            </div>
            {items.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center gap-2 px-2 py-1.5 border rounded text-sm bg-background"
              >
                <button
                  type="button"
                  onClick={() => handleSetPrimary(ch)}
                  disabled={ch.is_primary}
                  className="shrink-0"
                  title={ch.is_primary ? 'Основной канал' : 'Сделать основным'}
                >
                  <Star
                    className={`size-4 ${
                      ch.is_primary
                        ? 'fill-yellow-400 text-yellow-400'
                        : 'text-muted-foreground hover:text-yellow-500'
                    }`}
                  />
                </button>
                <span className="flex-1 truncate">{ch.external_id}</span>
                {ch.label && (
                  <span className="text-xs text-muted-foreground">— {ch.label}</span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => handleDelete(ch)}
                  title="Удалить канал"
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Форма добавления нового канала */}
      {adding && (
        <div className="border rounded p-3 space-y-2 bg-muted/30">
          <div className="grid grid-cols-3 gap-2">
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="phone">Телефон</SelectItem>
                <SelectItem value="telegram">Telegram</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="col-span-2"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder={CHANNEL_TYPE_PLACEHOLDERS[newType] ?? 'Значение'}
              autoFocus
            />
          </div>
          <Input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Подпись (рабочий / личный) — опционально"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={createMut.isPending || !newValue.trim()}
            >
              {createMut.isPending ? 'Добавление…' : 'Добавить'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
