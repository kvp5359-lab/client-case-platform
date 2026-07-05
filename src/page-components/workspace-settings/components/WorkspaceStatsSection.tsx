"use client"

import {
  Users, UserRound, FolderKanban, MessagesSquare, ListTodo, Mail,
  FileText, Send, Phone, AtSign, UserCircle, Hash,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useWorkspaceStats } from '@/hooks/useWorkspaceUsage'

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-gray-500" />
      </div>
      <div className="min-w-0">
        <div className="text-lg font-semibold text-gray-900 leading-none">{value}</div>
        <div className="text-xs text-gray-500 mt-1 truncate">{label}</div>
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{children}</div>
    </div>
  )
}

const fmt = (n: number) => n.toLocaleString('ru-RU')

export function WorkspaceStatsSection({ workspaceId }: { workspaceId: string }) {
  const { data: s, isLoading } = useWorkspaceStats(workspaceId)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">Статистика ресурсов</h3>
        <p className="text-sm text-gray-500 mt-1">Что сейчас в рабочем пространстве.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg border bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : s ? (
        <div className="space-y-5">
          <Group title="Люди">
            <StatCard icon={Users} label="Команда" value={fmt(s.team_members)} />
            <StatCard icon={UserRound} label="Контакты" value={fmt(s.contacts)} />
          </Group>

          <Group title="Работа">
            <StatCard icon={FolderKanban} label="Проекты" value={fmt(s.projects)} />
            <StatCard icon={Hash} label="Всего тредов" value={fmt(s.threads_total)} />
            <StatCard icon={ListTodo} label="Задачи" value={fmt(s.tasks_count)} />
            <StatCard icon={MessagesSquare} label="Чаты" value={fmt(s.chats_count)} />
            <StatCard icon={Mail} label="Письма (треды)" value={fmt(s.emails_count)} />
            <StatCard icon={FileText} label="Документы" value={fmt(s.documents_count)} />
          </Group>

          <Group title="Переписка">
            <StatCard icon={MessagesSquare} label="Сообщений всего" value={fmt(s.messages_total)} />
            <StatCard icon={Send} label="За этот месяц" value={fmt(s.messages_month)} />
          </Group>

          <Group title="Подключённые каналы">
            <StatCard icon={Send} label="Telegram-боты" value={fmt(s.telegram_integrations)} />
            <StatCard icon={Phone} label="WhatsApp (Wazzup)" value={fmt(s.wazzup_channels)} />
            <StatCard icon={AtSign} label="Почтовые ящики" value={fmt(s.email_accounts)} />
            <StatCard icon={UserCircle} label="Telegram-аккаунты" value={fmt(s.mtproto_sessions)} />
          </Group>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Нет данных</p>
      )}
    </div>
  )
}
