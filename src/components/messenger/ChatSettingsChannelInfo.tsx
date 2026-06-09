/**
 * Блок «Канал» в настройках личного диалога (тред без project_id).
 *
 * Делает две вещи, которых раньше в диалоге не было:
 *  1. Явно показывает, ЧТО это за канал — WhatsApp (Wazzup) / Instagram /
 *     Telegram Business — с иконкой и номером. Раньше канал угадывался только
 *     по бледной иконке у названия.
 *  2. Позволяет передать диалог другому сотруднику (смена owner_user_id).
 *     Передать можно только сотруднику воркспейса (staff), не клиенту.
 *
 * Показывается только в edit-mode для тредов без проекта, привязанных к
 * Wazzup или Telegram Business. Для проектных тредов и внутренних чатов не
 * рендерится.
 */

import { useMemo, useState } from 'react'
import { Send, UserRound, ChevronDown, Loader2, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { WhatsAppIcon } from './brandIcons'
import { useWazzupChannels } from '@/hooks/useWazzup'
import { useChangeThreadOwner } from '@/hooks/messenger/useProjectThreads'
import { getRoleGroup, type Participant } from './chatSettingsTypes'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { cn } from '@/lib/utils'

type ChatSettingsChannelInfoProps = {
  thread: ProjectThread
  workspaceId: string
  participants: Participant[]
}

/** Формат телефона E.164-без-плюса → «+34 617 787 730» (просто читабельные группы). */
function formatPhone(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  // Грубая группировка: + и тройками. Не идеально для всех стран, но читабельно.
  return '+' + digits.replace(/(\d{1,3})(?=(\d{3})+$)/g, '$1 ')
}

function participantName(p: Participant): string {
  return [p.name, p.last_name].filter(Boolean).join(' ').trim() || 'Без имени'
}

export function ChatSettingsChannelInfo({
  thread,
  workspaceId,
  participants,
}: ChatSettingsChannelInfoProps) {
  const [transferOpen, setTransferOpen] = useState(false)
  const { data: wazzupChannels = [] } = useWazzupChannels(
    thread.wazzup_channel_id ? workspaceId : undefined,
  )
  const changeOwner = useChangeThreadOwner(workspaceId)

  // ── Определяем канал ──
  const channelMeta = useMemo(() => {
    if (thread.wazzup_channel_id) {
      const ch = wazzupChannels.find((c) => c.id === thread.wazzup_channel_id)
      const isInstagram = ch?.transport === 'instagram'
      return {
        Icon: isInstagram ? Send : WhatsAppIcon,
        iconClass: isInstagram ? 'text-pink-500' : 'text-emerald-600',
        label: isInstagram ? 'Instagram (Wazzup)' : 'WhatsApp (Wazzup)',
        detail: isInstagram ? (thread.wazzup_chat_id ?? null) : formatPhone(ch?.phone),
      }
    }
    if (thread.business_connection_id) {
      return {
        Icon: Send,
        iconClass: 'text-[#2AABEE]',
        label: 'Telegram (личный)',
        detail: null,
      }
    }
    return null
  }, [thread.wazzup_channel_id, thread.wazzup_chat_id, thread.business_connection_id, wazzupChannels])

  // Только сотрудники воркспейса (staff) могут быть владельцами личного диалога.
  const staff = useMemo(
    () =>
      participants.filter(
        (p) => p.user_id && !p.is_deleted && getRoleGroup(p.workspace_roles) === 'staff',
      ),
    [participants],
  )

  const owner = useMemo(
    () => staff.find((p) => p.user_id === thread.owner_user_id) ?? null,
    [staff, thread.owner_user_id],
  )

  if (!channelMeta) return null
  const { Icon, iconClass, label, detail } = channelMeta

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-muted-foreground">Канал</label>

      <div className="rounded-lg border px-3 py-2 flex flex-col gap-2">
        {/* Тип канала + номер */}
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={cn('h-4 w-4 shrink-0', iconClass)} />
          <span className="text-sm font-medium truncate">{label}</span>
          {detail && (
            <span className="text-sm text-muted-foreground truncate ml-auto">{detail}</span>
          )}
        </div>

        {/* Ответственный сотрудник + передача */}
        <div className="flex items-center gap-2 border-t pt-2">
          <UserRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">Ответственный:</span>
          <span className="text-xs font-medium truncate">
            {owner ? participantName(owner) : 'не назначен'}
          </span>

          <Popover open={transferOpen} onOpenChange={setTransferOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                disabled={changeOwner.isPending}
                className="ml-auto shrink-0 flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-50"
              >
                {changeOwner.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                Передать
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-1">
              {staff.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Нет сотрудников</p>
              ) : (
                staff.map((p) => {
                  const isCurrent = p.user_id === thread.owner_user_id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isCurrent}
                      onClick={() => {
                        if (isCurrent || !p.user_id) return
                        changeOwner.mutate(
                          { threadId: thread.id, newOwnerUserId: p.user_id },
                          { onSuccess: () => setTransferOpen(false) },
                        )
                      }}
                      className={cn(
                        'w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 flex items-center gap-2',
                        isCurrent && 'text-muted-foreground cursor-default hover:bg-transparent',
                      )}
                    >
                      <span className="truncate flex-1">{participantName(p)}</span>
                      {isCurrent && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
                    </button>
                  )
                })
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  )
}
