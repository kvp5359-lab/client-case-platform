"use client"

/**
 * Вкладка «Настройки»: регистрация (открыта / по инвайтам), дефолтный триал
 * для новых воркспейсов, инвайт-ссылки.
 * ⚠️ Гейт регистрации — UI-уровень (Google OAuth его обходит).
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  usePlatformConfig,
  useSetPlatformConfig,
  useAdminPlans,
  useAdminInvites,
  useCreateInvite,
  useDeleteInvite,
} from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { fmtDate } from './WorkspacesTab'

const inputCls = 'mt-0.5 rounded border px-2 py-1 text-sm'

function ConfigSection() {
  const { data: cfg, isLoading } = usePlatformConfig(true)
  const { data: plans } = useAdminPlans(true)
  const save = useSetPlatformConfig()
  const [draft, setDraft] = useState<{ open: boolean; days: string; plan: string } | null>(null)

  if (isLoading || !cfg) return <div className="p-4 text-sm text-gray-500">Загрузка…</div>

  const d = draft ?? {
    open: cfg.registration_open,
    days: String(cfg.default_trial_days),
    plan: cfg.default_trial_plan_code ?? '',
  }

  const onSave = async () => {
    try {
      await save.mutateAsync({
        registration_open: d.open,
        default_trial_days: Number(d.days) || 0,
        default_trial_plan_code: d.plan || null,
      })
      toast.success('Настройки сохранены')
      setDraft(null)
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось сохранить'))
    }
  }

  return (
    <div className="rounded-lg border p-4 space-y-3 max-w-lg">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={d.open}
          onChange={(e) => setDraft({ ...d, open: e.target.checked })}
        />
        <span>Регистрация открыта для всех</span>
      </label>
      {!d.open && (
        <p className="text-xs text-amber-600">
          Регистрация по инвайтам. ⚠️ Вход через Google этот запрет пока обходит — учитывай.
        </p>
      )}
      <div className="flex items-end gap-3">
        <label className="block text-sm">
          <span className="text-gray-600">Триал новым воркспейсам, дней (0 = выкл)</span>
          <input
            className={`${inputCls} w-28 block`}
            type="number"
            min={0}
            value={d.days}
            onChange={(e) => setDraft({ ...d, days: e.target.value })}
          />
        </label>
        <label className="block text-sm flex-1">
          <span className="text-gray-600">Тариф на время триала</span>
          <select
            className={`${inputCls} w-full block`}
            value={d.plan}
            onChange={(e) => setDraft({ ...d, plan: e.target.value })}
          >
            <option value="">Без тарифа (безлимит на триале)</option>
            {(plans ?? []).filter((p) => p.is_active).map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex justify-end">
        <button
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={save.isPending || draft === null}
          onClick={onSave}
        >
          Сохранить
        </button>
      </div>
    </div>
  )
}

function InvitesSection() {
  const { data: invites, isLoading } = useAdminInvites(true)
  const createInvite = useCreateInvite()
  const deleteInvite = useDeleteInvite()
  const [note, setNote] = useState('')
  const [maxUses, setMaxUses] = useState('1')
  const [expiresDays, setExpiresDays] = useState('')

  const onCreate = async () => {
    try {
      const res = await createInvite.mutateAsync({
        note: note.trim() || null,
        maxUses: Number(maxUses) || 1,
        expiresDays: expiresDays.trim() === '' ? null : Number(expiresDays),
      })
      setNote('')
      const link = `${window.location.origin}/register?invite=${res.code}`
      await navigator.clipboard.writeText(link).catch(() => {})
      toast.success('Инвайт создан, ссылка скопирована')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось создать инвайт'))
    }
  }

  const copyLink = async (code: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/register?invite=${code}`)
    toast.success('Ссылка скопирована')
  }

  const onDelete = async (id: string) => {
    try {
      await deleteInvite.mutateAsync(id)
      toast.success('Инвайт удалён')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось удалить'))
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2 flex-wrap">
        <label className="block text-sm">
          <span className="text-gray-600">Заметка (для кого)</span>
          <input className={`${inputCls} block w-56`} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Использований</span>
          <input className={`${inputCls} block w-24`} type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-600">Срок, дней (пусто = бессрочно)</span>
          <input className={`${inputCls} block w-40`} type="number" min={1} value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} />
        </label>
        <button
          className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={createInvite.isPending}
          onClick={onCreate}
        >
          + Создать инвайт
        </button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        {isLoading ? (
          <div className="p-4 text-sm text-gray-500">Загрузка…</div>
        ) : !invites || invites.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">Инвайтов нет.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                <th className="px-3 py-2 font-medium">Код</th>
                <th className="px-3 py-2 font-medium">Заметка</th>
                <th className="px-3 py-2 font-medium">Использован</th>
                <th className="px-3 py-2 font-medium">Действует до</th>
                <th className="px-3 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => {
                const exhausted = inv.used_count >= inv.max_uses
                const expired = inv.expires_at != null && new Date(inv.expires_at) < new Date()
                return (
                  <tr key={inv.id} className={`border-b ${exhausted || expired ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-2 font-mono text-xs">{inv.code}</td>
                    <td className="px-3 py-2 text-gray-700">{inv.note ?? ''}</td>
                    <td className="px-3 py-2 text-gray-700">{inv.used_count} / {inv.max_uses}</td>
                    <td className="px-3 py-2 text-gray-700">{inv.expires_at ? fmtDate(inv.expires_at) : 'бессрочно'}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button className="text-xs text-blue-600 hover:underline mr-3" onClick={() => copyLink(inv.code)}>
                        ссылка
                      </button>
                      <button className="text-xs text-red-600 hover:underline" onClick={() => onDelete(inv.id)}>
                        удалить
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function SettingsTab() {
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Регистрация и триал</h2>
        <ConfigSection />
      </section>
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-900">Инвайты</h2>
        <InvitesSection />
      </section>
    </div>
  )
}
