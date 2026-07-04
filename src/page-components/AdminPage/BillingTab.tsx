"use client"

/**
 * Вкладка «Биллинг»: редактор тарифов + журнал платежей с ручной отметкой оплаты.
 * Платёж продлевает «оплачено до» на N месяцев и переводит статус в «Активен».
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useAdminPlans,
  useUpsertPlan,
  useAdminPayments,
  useRecordPayment,
  useDeletePayment,
  useAdminWorkspaces,
  type AdminPlan,
} from '@/hooks/useAdmin'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { fmtNum, fmtDate } from './WorkspacesTab'

// ── Редактор тарифа ──────────────────────────────────────────────────────────

type PlanDraft = {
  code: string
  name: string
  description: string
  price_monthly: string
  currency: string
  max_participants: string
  max_projects: string
  max_storage_mb: string
  ai_tokens_monthly: string
  is_active: boolean
  sort_order: string
}

const emptyDraft: PlanDraft = {
  code: '', name: '', description: '', price_monthly: '0', currency: 'RUB',
  max_participants: '', max_projects: '', max_storage_mb: '', ai_tokens_monthly: '',
  is_active: true, sort_order: '0',
}

function planToDraft(p: AdminPlan): PlanDraft {
  return {
    code: p.code,
    name: p.name,
    description: p.description ?? '',
    price_monthly: String(p.price_monthly),
    currency: p.currency,
    max_participants: p.max_participants == null ? '' : String(p.max_participants),
    max_projects: p.max_projects == null ? '' : String(p.max_projects),
    max_storage_mb: p.max_storage_mb == null ? '' : String(p.max_storage_mb),
    ai_tokens_monthly: p.ai_tokens_monthly == null ? '' : String(p.ai_tokens_monthly),
    is_active: p.is_active,
    sort_order: String(p.sort_order),
  }
}

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'mt-0.5 w-full rounded border px-2 py-1 text-sm'

function PlanEditDialog({
  draft, isNew, onClose,
}: { draft: PlanDraft; isNew: boolean; onClose: () => void }) {
  const [d, setD] = useState(draft)
  const upsert = useUpsertPlan()
  const set = (k: keyof PlanDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((prev) => ({ ...prev, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const onSave = async () => {
    try {
      await upsert.mutateAsync({
        code: d.code.trim(),
        name: d.name.trim(),
        description: d.description.trim() || null,
        price_monthly: Number(d.price_monthly) || 0,
        currency: d.currency.trim() || 'RUB',
        max_participants: numOrNull(d.max_participants),
        max_projects: numOrNull(d.max_projects),
        max_storage_mb: numOrNull(d.max_storage_mb),
        ai_tokens_monthly: numOrNull(d.ai_tokens_monthly),
        is_active: d.is_active,
        sort_order: Number(d.sort_order) || 0,
      })
      toast.success('Тариф сохранён')
      onClose()
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось сохранить тариф'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Новый тариф' : `Тариф «${draft.name}»`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Код (латиницей)">
              <input className={inputCls} value={d.code} onChange={set('code')} disabled={!isNew} />
            </Field>
            <Field label="Название">
              <input className={inputCls} value={d.name} onChange={set('name')} />
            </Field>
          </div>
          <Field label="Описание">
            <input className={inputCls} value={d.description} onChange={set('description')} />
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Цена в месяц">
              <input className={inputCls} type="number" value={d.price_monthly} onChange={set('price_monthly')} />
            </Field>
            <Field label="Валюта">
              <input className={inputCls} value={d.currency} onChange={set('currency')} />
            </Field>
          </div>
          <p className="text-xs text-gray-400">Лимиты: пусто = без ограничения.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Макс. участников">
              <input className={inputCls} type="number" value={d.max_participants} onChange={set('max_participants')} />
            </Field>
            <Field label="Макс. проектов">
              <input className={inputCls} type="number" value={d.max_projects} onChange={set('max_projects')} />
            </Field>
            <Field label="Хранилище, МБ">
              <input className={inputCls} type="number" value={d.max_storage_mb} onChange={set('max_storage_mb')} />
            </Field>
            <Field label="Токены ИИ/мес">
              <input className={inputCls} type="number" value={d.ai_tokens_monthly} onChange={set('ai_tokens_monthly')} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2.5 items-end">
            <Field label="Порядок сортировки">
              <input className={inputCls} type="number" value={d.sort_order} onChange={set('sort_order')} />
            </Field>
            <label className="flex items-center gap-2 text-sm pb-1.5">
              <input type="checkbox" checked={d.is_active} onChange={set('is_active')} />
              <span>Активен (виден клиентам)</span>
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className="rounded border px-3 py-1.5 text-sm" onClick={onClose}>Отмена</button>
            <button
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={upsert.isPending || !d.code.trim() || !d.name.trim()}
              onClick={onSave}
            >
              Сохранить
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Отметка оплаты ───────────────────────────────────────────────────────────

function RecordPaymentDialog({ onClose }: { onClose: () => void }) {
  const { data: workspaces } = useAdminWorkspaces(true)
  const record = useRecordPayment()
  const [wsId, setWsId] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('RUB')
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [months, setMonths] = useState('1')
  const [comment, setComment] = useState('')

  const onSave = async () => {
    try {
      await record.mutateAsync({
        workspaceId: wsId,
        amount: Number(amount) || 0,
        currency,
        paidAt,
        periodMonths: Number(months) || 0,
        comment: comment.trim() || null,
      })
      toast.success('Оплата отмечена, период продлён')
      onClose()
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось отметить оплату'))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Отметить оплату</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <Field label="Воркспейс">
            <select className={inputCls} value={wsId} onChange={(e) => setWsId(e.target.value)}>
              <option value="">— выбери —</option>
              {(workspaces ?? []).filter((w) => !w.is_deleted).map((w) => (
                <option key={w.workspace_id} value={w.workspace_id}>
                  {w.workspace_name} ({w.owner_email ?? 'без владельца'})
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Сумма">
              <input className={inputCls} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Валюта">
              <input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)} />
            </Field>
            <Field label="Дата оплаты">
              <input className={inputCls} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </Field>
            <Field label="Продлить на, мес">
              <input className={inputCls} type="number" min={0} value={months} onChange={(e) => setMonths(e.target.value)} />
            </Field>
          </div>
          <Field label="Комментарий">
            <input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <p className="text-xs text-gray-400">
            «Оплачено до» продлится от текущей даты окончания (или от сегодня) на указанное число месяцев,
            статус станет «Активен». 0 месяцев — только записать платёж.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="rounded border px-3 py-1.5 text-sm" onClick={onClose}>Отмена</button>
            <button
              className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              disabled={record.isPending || !wsId || !amount}
              onClick={onSave}
            >
              Сохранить
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Вкладка ──────────────────────────────────────────────────────────────────

export function BillingTab() {
  const { data: plans, isLoading: plansLoading } = useAdminPlans(true)
  const { data: payments, isLoading: paymentsLoading } = useAdminPayments(true)
  const deletePayment = useDeletePayment()
  const [editingPlan, setEditingPlan] = useState<{ draft: PlanDraft; isNew: boolean } | null>(null)
  const [recordingPayment, setRecordingPayment] = useState(false)

  const onDeletePayment = async (id: string) => {
    if (!window.confirm('Удалить платёж? Даты биллинга не откатятся — при необходимости поправь их в карточке воркспейса.')) return
    try {
      await deletePayment.mutateAsync(id)
      toast.success('Платёж удалён')
    } catch (e) {
      toast.error(getUserFacingErrorMessage(e, 'Не удалось удалить платёж'))
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Тарифы</h2>
          <button
            className="rounded border px-2.5 py-1 text-sm hover:bg-gray-50"
            onClick={() => setEditingPlan({ draft: emptyDraft, isNew: true })}
          >
            + Новый тариф
          </button>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          {plansLoading ? (
            <div className="p-4 text-sm text-gray-500">Загрузка…</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Тариф</th>
                  <th className="px-3 py-2 font-medium">Цена/мес</th>
                  <th className="px-3 py-2 font-medium">Участники</th>
                  <th className="px-3 py-2 font-medium">Проекты</th>
                  <th className="px-3 py-2 font-medium">Хранилище</th>
                  <th className="px-3 py-2 font-medium">Токены ИИ</th>
                  <th className="px-3 py-2 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {(plans ?? []).map((p) => (
                  <tr
                    key={p.id}
                    className="border-b hover:bg-gray-50 cursor-pointer"
                    onClick={() => setEditingPlan({ draft: planToDraft(p), isNew: false })}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-400">{p.code}</div>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{fmtNum(p.price_monthly)} {p.currency}</td>
                    <td className="px-3 py-2 text-gray-700">{fmtNum(p.max_participants)}</td>
                    <td className="px-3 py-2 text-gray-700">{fmtNum(p.max_projects)}</td>
                    <td className="px-3 py-2 text-gray-700">{p.max_storage_mb == null ? '∞' : `${fmtNum(p.max_storage_mb)} МБ`}</td>
                    <td className="px-3 py-2 text-gray-700">{fmtNum(p.ai_tokens_monthly)}</td>
                    <td className="px-3 py-2">
                      {p.is_active ? (
                        <span className="text-emerald-600 text-xs">активен</span>
                      ) : (
                        <span className="text-gray-400 text-xs">скрыт</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="text-xs text-gray-400">Клик по строке — редактирование. Удаления нет — вместо этого сними галочку «Активен».</p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Платежи</h2>
          <button
            className="rounded bg-gray-900 px-2.5 py-1 text-sm text-white"
            onClick={() => setRecordingPayment(true)}
          >
            + Отметить оплату
          </button>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          {paymentsLoading ? (
            <div className="p-4 text-sm text-gray-500">Загрузка…</div>
          ) : !payments || payments.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Платежей пока нет.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <th className="px-3 py-2 font-medium">Дата</th>
                  <th className="px-3 py-2 font-medium">Воркспейс</th>
                  <th className="px-3 py-2 font-medium">Сумма</th>
                  <th className="px-3 py-2 font-medium">Период</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{fmtDate(p.paid_at)}</td>
                    <td className="px-3 py-2 text-gray-900">{p.workspace_name ?? p.workspace_id}</td>
                    <td className="px-3 py-2 text-gray-900">{fmtNum(p.amount)} {p.currency}</td>
                    <td className="px-3 py-2 text-gray-700">{p.period_months} мес</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{p.comment ?? ''}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => onDeletePayment(p.id)}
                      >
                        удалить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {editingPlan && (
        <PlanEditDialog draft={editingPlan.draft} isNew={editingPlan.isNew} onClose={() => setEditingPlan(null)} />
      )}
      {recordingPayment && <RecordPaymentDialog onClose={() => setRecordingPayment(false)} />}
    </div>
  )
}
