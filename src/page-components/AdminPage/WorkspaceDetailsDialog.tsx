"use client"

/**
 * Карточка воркспейса в админке: владелец, биллинг, потребление, интеграции,
 * участники, динамика токенов. Read-only (действия — в таблице).
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAdminWorkspaceDetails } from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { fmtDate } from './WorkspacesTab'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium uppercase text-gray-500 mb-1.5">{title}</h3>
      {children}
    </div>
  )
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm py-0.5">
      <span className="text-gray-500 shrink-0">{k}</span>
      <span className="text-gray-900 text-right">{v}</span>
    </div>
  )
}

const num = (n: number | null | undefined) => (n ?? 0).toLocaleString('ru-RU')

export function WorkspaceDetailsDialog({
  workspaceId,
  onClose,
}: {
  workspaceId: string | null
  onClose: () => void
}) {
  const { data, isLoading, error } = useAdminWorkspaceDetails(workspaceId)

  return (
    <Dialog open={!!workspaceId} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.workspace?.name ?? 'Воркспейс'}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">Загрузка…</div>
        ) : error ? (
          <div className="p-4 text-sm text-red-600">{getUserFacingErrorMessage(error, 'Не удалось загрузить')}</div>
        ) : !data ? null : (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Section title="Владелец">
                {data.owner ? (
                  <>
                    <KV k="Имя" v={data.owner.name || '—'} />
                    <KV k="Email" v={data.owner.email ?? '—'} />
                    <KV k="Телефон" v={data.owner.phone ?? '—'} />
                  </>
                ) : (
                  <p className="text-sm text-gray-400">Владелец не найден</p>
                )}
              </Section>

              <Section title="Тариф и статус">
                <KV k="Тариф" v={data.billing?.plan_name ?? 'Без тарифа (безлимит)'} />
                <KV k="Статус" v={data.billing?.status ?? '—'} />
                <KV k="Триал до" v={fmtDate(data.billing?.trial_ends_at ?? null)} />
                <KV k="Оплачено до" v={fmtDate(data.billing?.paid_until ?? null)} />
                <KV k="Создан" v={fmtDate(data.workspace?.created_at ?? null)} />
                {data.workspace?.is_suspended && (
                  <KV k="Заблокирован" v={fmtDate(data.workspace.suspended_at)} />
                )}
              </Section>

              <Section title="Потребление">
                <KV k="Участники" v={num(data.usage.participants)} />
                <KV k="Проекты" v={num(data.usage.projects)} />
                <KV k="Треды (задачи/чаты)" v={num(data.usage.threads)} />
                <KV k="Хранилище" v={`${num(data.usage.storage_mb)} МБ`} />
                <KV k="Сообщений за 30 дней" v={num(data.usage.messages_30d)} />
                <KV k="Токены ИИ за месяц" v={num(data.usage.ai_tokens_month)} />
                <KV k="Последняя активность" v={fmtDate(data.usage.last_activity_at)} />
              </Section>

              <Section title="Интеграции">
                <KV k="Telegram-боты" v={num(data.integrations.telegram_bots)} />
                <KV k="WhatsApp (Wazzup)" v={num(data.integrations.wazzup_channels)} />
                <KV
                  k="Email-ящики"
                  v={
                    data.integrations.email_watch_expired > 0 ? (
                      <span className="text-red-600">
                        {num(data.integrations.email_accounts)} (протух watch: {data.integrations.email_watch_expired})
                      </span>
                    ) : (
                      num(data.integrations.email_accounts)
                    )
                  }
                />
                <KV k="Личные TG (MTProto)" v={num(data.integrations.mtproto_sessions)} />
                <KV k="TG Business" v={num(data.integrations.business_connections)} />
              </Section>
            </div>

            {data.ai_monthly.length > 0 && (
              <Section title="Токены ИИ по месяцам">
                <div className="space-y-1">
                  {data.ai_monthly.map((m) => {
                    const maxTok = Math.max(...data.ai_monthly.map((x) => x.total_tokens), 1)
                    return (
                      <div key={m.period} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-500">
                          {new Date(m.period).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}
                        </span>
                        <div className="flex-1 h-3 rounded bg-gray-100 overflow-hidden">
                          <div
                            className="h-full bg-blue-400"
                            style={{ width: `${Math.max(2, Math.round((m.total_tokens / maxTok) * 100))}%` }}
                          />
                        </div>
                        <span className="w-24 text-right text-gray-700">{num(m.total_tokens)}</span>
                      </div>
                    )
                  })}
                </div>
              </Section>
            )}

            <Section title={`Участники (${data.participants.length}${data.participants.length === 200 ? '+' : ''})`}>
              <div className="max-h-64 overflow-y-auto rounded border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-500">
                      <th className="px-2 py-1.5 font-medium">Имя</th>
                      <th className="px-2 py-1.5 font-medium">Email</th>
                      <th className="px-2 py-1.5 font-medium">Роли</th>
                      <th className="px-2 py-1.5 font-medium">Доступ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.participants.map((p, i) => (
                      <tr key={i} className="border-b last:border-b-0">
                        <td className="px-2 py-1">{p.name || '—'}</td>
                        <td className="px-2 py-1 text-gray-500">{p.email ?? '—'}</td>
                        <td className="px-2 py-1 text-gray-500">{(p.roles ?? []).join(', ') || '—'}</td>
                        <td className="px-2 py-1">
                          {!p.has_account ? (
                            <span className="text-gray-400">без аккаунта</span>
                          ) : p.can_login ? (
                            <span className="text-emerald-600">активен</span>
                          ) : (
                            <span className="text-red-600">заблокирован</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
