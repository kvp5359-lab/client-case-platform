"use client"

/**
 * Секция «Уведомления» в настройках чата.
 *  - Личная подписка пользователя на тред (toggle).
 *  - Для владельца/менеджеров — шестерёнка: разворачивает поле выбора
 *    подписчиков (как «Кто видит чат») с возможностью подписать/отписать
 *    любого участника. Право проверяет RPC (сам участник ИЛИ manage_workspace_settings).
 */
import { useState } from 'react'
import Image from 'next/image'
import { Bell, BellOff, Settings, Check, Search, X, Users } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useThreadSubscription, useThreadSubscribers } from '@/hooks/messenger/useThreadSubscription'
import type { Participant } from './chatSettingsTypes'
import { getRoleGroup } from './chatSettingsTypes'

export function ChatSettingsNotifications({
  threadId,
  workspaceId,
  participants,
  canManage,
  userId,
}: {
  threadId: string
  workspaceId: string
  participants: Participant[]
  canManage: boolean
  userId: string | undefined
}) {
  const { isSubscribed, setSubscribed, pending } = useThreadSubscription(threadId, workspaceId)
  const subscribed = isSubscribed === true
  const loading = isSubscribed === null

  const [manageOpen, setManageOpen] = useState(false)
  const [search, setSearch] = useState('')
  const subs = useThreadSubscribers(threadId, workspaceId, canManage && manageOpen)

  // Участники, у которых подписка вообще релевантна (есть в карте RPC).
  const known = participants.filter((p) => p.id in subs.subscribers)
  const filtered = known
    .filter((p) =>
      !search.trim()
        ? true
        : `${p.name ?? ''} ${p.last_name ?? ''}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'ru'))

  const groups = [
    { label: 'Сотрудники', items: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'staff') },
    { label: 'Внешние сотрудники', items: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'external') },
    { label: 'Клиенты', items: filtered.filter((p) => getRoleGroup(p.workspace_roles) === 'client') },
  ].filter((g) => g.items.length > 0)

  const subscribedChips = known.filter((p) => subs.subscribers[p.id])

  const name = (p: Participant) =>
    p.user_id === userId ? 'Я' : [p.name, p.last_name].filter(Boolean).join(' ')

  return (
    <div className="space-y-1.5">
      <Label>Уведомления</Label>

      {/* Один контур: слева кнопка подписки, справа внутри — шестерёнка */}
      <div className="flex items-stretch rounded-md border overflow-hidden">
        <button
          type="button"
          disabled={pending || loading}
          onClick={() => setSubscribed(!subscribed)}
          className={cn(
            'flex items-center gap-2 flex-1 min-w-0 px-3 py-2 text-sm transition-colors',
            'hover:bg-muted/50 disabled:opacity-50 disabled:cursor-default',
            subscribed ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {subscribed ? <Bell className="h-4 w-4 shrink-0" /> : <BellOff className="h-4 w-4 shrink-0" />}
          <span className="truncate">
            {loading ? 'Загрузка…' : subscribed ? 'Вы подписаны на уведомления' : 'Вы не подписаны'}
          </span>
          {!loading && (
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {subscribed ? 'Отписаться' : 'Подписаться'}
            </span>
          )}
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => setManageOpen((o) => !o)}
            title="Настроить подписчиков"
            className={cn(
              'shrink-0 px-2.5 flex items-center justify-center transition-colors',
              manageOpen ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50',
            )}
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Управление подписчиками (менеджеры) */}
      {canManage && manageOpen && (
        <Popover onOpenChange={(v) => !v && setSearch('')}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm text-left hover:bg-muted/50 transition-colors min-h-[40px] flex-wrap"
            >
              {subscribedChips.length === 0 ? (
                <span className="flex items-center gap-2 text-muted-foreground/60">
                  <Users className="w-4 h-4 shrink-0" />
                  Кто получает уведомления
                </span>
              ) : (
                subscribedChips.map((p) => (
                  <span
                    key={p.id}
                    className="group relative inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-brand-100 text-xs font-medium"
                  >
                    {p.avatar_url ? (
                      <Image src={p.avatar_url} alt="" width={16} height={16} className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
                        {(p.name?.[0] ?? '?').toUpperCase()}
                      </span>
                    )}
                    {name(p)}
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label="Убрать"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        if (!subs.pending) subs.setFor(p.id, false)
                      }}
                      className="absolute inset-y-0 right-0 hidden group-hover:flex items-center px-1.5 bg-brand-100 rounded-r-md text-brand-700 hover:text-foreground cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </span>
                ))
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <div className="px-3 py-2 border-b">
              <div className="flex items-center gap-2 border rounded-md px-2 py-1">
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Поиск..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="text-sm bg-transparent focus:outline-none w-full"
                  autoFocus
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} className="shrink-0">
                    <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto overscroll-contain py-1" onWheel={(e) => e.stopPropagation()}>
              {subs.isLoading && (
                <p className="px-3 py-2 text-xs text-muted-foreground">Загрузка…</p>
              )}
              {!subs.isLoading &&
                groups.map((g, i) => (
                  <div key={g.label}>
                    {i > 0 && <div className="border-t my-1" />}
                    <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                      {g.label}
                    </p>
                    {g.items.map((p) => {
                      const on = !!subs.subscribers[p.id]
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={subs.pending}
                          onClick={() => subs.setFor(p.id, !on)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-3 py-1 text-left transition-colors disabled:opacity-50',
                            on ? 'bg-brand-100 hover:bg-brand-200' : 'hover:bg-muted/50',
                          )}
                        >
                          {p.avatar_url ? (
                            <Image src={p.avatar_url} alt="" width={24} height={24} className="w-6 h-6 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                              {(p.name?.[0] ?? '?').toUpperCase()}
                            </div>
                          )}
                          <span className="text-sm truncate flex-1">{name(p)}</span>
                          <div
                            className={cn(
                              'w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors',
                              on ? 'bg-primary border-primary text-primary-foreground' : 'border-input',
                            )}
                          >
                            {on && <Check className="w-3 h-3" />}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ))}
              {!subs.isLoading && filtered.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {search ? 'Никого не найдено' : 'Нет участников'}
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      <p className="text-xs text-muted-foreground">
        {canManage
          ? 'Подписчики получают непрочитанное и уведомления по треду. Шестерёнка — управлять подписчиками; доступ к чату это не меняет.'
          : 'Личная настройка: вы получаете непрочитанное и уведомления по этому треду. Доступ к чату это не меняет.'}
      </p>
    </div>
  )
}
