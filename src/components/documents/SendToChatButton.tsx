"use client"

import { Button } from '@/components/ui/button'
import { Send, MessageCircle, Users, Sparkles } from 'lucide-react'
import type { PanelTab } from '@/store/sidePanelStore.types'

const SEND_TARGETS: Record<
  string,
  {
    label: string
    icon: typeof Send
    iconClass?: string
    target: 'client' | 'internal' | 'assistant'
  }
> = {
  client: {
    label: 'Чат клиента',
    icon: MessageCircle,
    iconClass: 'text-blue-500',
    target: 'client',
  },
  internal: { label: 'Чат команды', icon: Users, target: 'internal' },
  assistant: {
    label: 'Ассистент',
    icon: Sparkles,
    iconClass: 'text-purple-500',
    target: 'assistant',
  },
}

interface SendToChatButtonProps {
  panelTab: PanelTab | null
  onSendToChat: (target: 'client' | 'internal' | 'assistant') => void
  isProcessing: boolean
}

/** Кнопка «Отправить в» — показывает только текущую открытую панель */
export function SendToChatButton({ panelTab, onSendToChat, isProcessing }: SendToChatButtonProps) {
  const target =
    panelTab === 'client' || panelTab === 'internal' || panelTab === 'assistant'
      ? SEND_TARGETS[panelTab]
      : null

  if (!target) return null

  const Icon = target.icon

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isProcessing}
      onClick={() => onSendToChat(target.target)}
    >
      <Icon className={`h-4 w-4 mr-1.5 ${target.iconClass ?? ''}`} />
      {target.label}
    </Button>
  )
}
