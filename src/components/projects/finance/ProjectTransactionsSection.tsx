/**
 * ProjectTransactionsSection — таблица транзакций (доходы или расходы).
 * Единый компонент с пропом type — структура полей и логика идентичные.
 */

import { useMemo, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useFinanceServices } from '@/hooks/useFinanceServices'
import { useFinanceTaxRates } from '@/hooks/useFinanceTaxRates'
import { useProjectServices } from '@/hooks/useProjectServices'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import {
  useProjectTransactions,
  useCreateProjectTransaction,
  useUpdateProjectTransaction,
  useDeleteProjectTransaction,
  usePatchProjectTransaction,
  type ProjectTransaction,
  type ProjectTransactionFormData,
  type ProjectTransactionPatch,
  type TransactionType,
} from '@/hooks/useProjectTransactions'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineEditSelect } from '@/components/ui/inline-edit-select'
import { ProjectTransactionFormDialog } from './ProjectTransactionFormDialog'

const fmt = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
  )

const formatDate = (iso: string): string => {
  // dd.MM.yyyy без часовой зоны (date — это просто дата без времени)
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

const TYPE_CONFIG: Record<
  TransactionType,
  { title: string; subjectLabel: string; emptyText: string; addLabel: string }
> = {
  income: {
    title: 'Доходы',
    subjectLabel: 'От кого',
    emptyText: 'Доходов пока нет',
    addLabel: 'Добавить доход',
  },
  expense: {
    title: 'Расходы',
    subjectLabel: 'Кому',
    emptyText: 'Расходов пока нет',
    addLabel: 'Добавить расход',
  },
}

interface Props {
  projectId: string
  workspaceId: string
  type: TransactionType
}

export function ProjectTransactionsSection({ projectId, workspaceId, type }: Props) {
  const config = TYPE_CONFIG[type]
  const { data, isLoading } = useProjectTransactions(projectId, type)
  const transactions = useMemo(() => data ?? [], [data])

  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const { data: catalog = [] } = useFinanceServices(workspaceId)
  const { data: taxRates = [] } = useFinanceTaxRates(workspaceId)
  // Услуги проекта нужны только для типа income — чтобы посчитать «Остаток»
  // (стоимость с налогом минус уже полученные доходы) и подставить его в форму.
  const { data: services = [] } = useProjectServices(type === 'income' ? projectId : undefined)

  const createMutation = useCreateProjectTransaction(projectId)
  const updateMutation = useUpdateProjectTransaction(projectId)
  const deleteMutation = useDeleteProjectTransaction(projectId)
  const patchMutation = usePatchProjectTransaction(projectId)

  const handlePatch = (id: string, patch: ProjectTransactionPatch) => {
    patchMutation.mutate(
      { id, patch },
      {
        onError: (e) =>
          toast.error('Не удалось сохранить', { description: (e as Error).message }),
      },
    )
  }

  const participantOptions = useMemo(
    () =>
      participants.map((p) => ({
        value: p.id,
        label: [p.name, p.last_name].filter(Boolean).join(' ') || p.name,
        hint: p.email ?? undefined,
      })),
    [participants],
  )

  const serviceOptions = useMemo(
    () => catalog.map((s) => ({ value: s.id, label: s.name })),
    [catalog],
  )

  const taxOptions = useMemo(
    () =>
      taxRates.map((t) => ({
        value: t.id,
        label: t.name,
        hint: `${Number(t.rate)}%`,
      })),
    [taxRates],
  )

  const taxRateById = (id: string): number | null => {
    const t = taxRates.find((r) => r.id === id)
    return t ? Number(t.rate) : null
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProjectTransaction | null>(null)

  const confirm = useConfirmDialog()

  const totalSum = useMemo(
    () => transactions.reduce((acc, t) => acc + Number(t.amount ?? 0), 0),
    [transactions],
  )

  // Остаток к получению: стоимость услуг с налогом минус уже полученные доходы.
  // Считаем только при создании нового дохода и не учитываем редактируемую
  // запись, чтобы показать «сколько осталось бы оплатить, если этой записи нет».
  const remainingAmount = useMemo(() => {
    if (type !== 'income') return null
    const servicesCost = services.reduce((acc, s) => {
      const sub = Number(s.total ?? 0)
      const rate = s.tax_rate == null ? 0 : Number(s.tax_rate)
      return acc + sub * (1 + rate / 100)
    }, 0)
    const incomesExcludingEditing = transactions.reduce((acc, t) => {
      if (editing && t.id === editing.id) return acc
      return acc + Number(t.amount ?? 0)
    }, 0)
    return servicesCost - incomesExcludingEditing
  }, [type, services, transactions, editing])

  const openCreate = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (trx: ProjectTransaction) => {
    setEditing(trx)
    setDialogOpen(true)
  }

  const handleSave = (form: ProjectTransactionFormData) => {
    if (form.amount <= 0) {
      toast.error('Сумма должна быть больше нуля')
      return
    }
    const handlers = {
      onSuccess: () => {
        toast.success(editing ? 'Сохранено' : 'Добавлено')
        setDialogOpen(false)
      },
      onError: (e: unknown) =>
        toast.error('Не удалось сохранить', { description: (e as Error).message }),
    }
    if (editing) {
      updateMutation.mutate({ id: editing.id, form }, handlers)
    } else {
      createMutation.mutate(form, handlers)
    }
  }

  const askDelete = async (trx: ProjectTransaction) => {
    const ok = await confirm.confirm({
      title: type === 'income' ? 'Удалить доход?' : 'Удалить расход?',
      description: `Запись на ${fmt(Number(trx.amount))} EUR от ${formatDate(trx.date)} будет удалена.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(trx.id, {
      onSuccess: () => toast.success('Удалено'),
      onError: (e) => toast.error('Не удалось удалить', { description: (e as Error).message }),
    })
  }


  return (
    <section className="group/section">
      <header className="flex items-center gap-3 mb-3">
        <h3 className="text-2xl font-semibold text-gray-900">{config.title}</h3>
        <Button
          size="sm"
          onClick={openCreate}
          className="opacity-0 group-hover/section:opacity-100 transition-opacity"
        >
          <Plus className="h-4 w-4 mr-1" />
          {config.addLabel}
        </Button>
      </header>
      <div>
        {isLoading || transactions.length === 0 ? (
          <EmptyState loading={isLoading} emptyText={config.emptyText} />
        ) : (
          <>
            {/* border-x только у tbody-строк через arbitrary variants —
                заголовок остаётся без боковых разделителей, а под последней
                строкой появляется border-b. */}
            <table
              className="w-full text-sm
                [&_thead_th]:border-y
                [&_thead_th:first-child]:border-l
                [&_thead_th:last-child]:border-r
                [&_tbody_tr_td:first-child]:border-l
                [&_tbody_tr_td:last-child]:border-r
                [&_tbody_tr:last-child_td]:border-b"
            >
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-28">Дата</th>
                  <th className="text-left px-3 py-2 font-medium">{config.subjectLabel}</th>
                  <th className="text-left px-3 py-2 font-medium">Статья</th>
                  <th className="text-right px-3 py-2 font-medium w-24">Налог</th>
                  <th className="text-right px-3 py-2 font-medium w-32">Сумма, EUR</th>
                  <th className="text-left px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2">
                      <InlineEditCell
                        type="date"
                        value={t.date}
                        onCommit={(v) => {
                          if (!v || v === t.date) return
                          handlePatch(t.id, { date: v })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineEditSelect
                        value={t.participant_id}
                        options={participantOptions}
                        emptyText="—"
                        noneLabel="— Не указан —"
                        searchPlaceholder="Поиск по имени или email"
                        popoverEmpty="Никого не нашли"
                        onCommit={(id) => handlePatch(t.id, { participant_id: id })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineEditSelect
                        value={t.service_id}
                        options={serviceOptions}
                        emptyText="—"
                        noneLabel="— Не указана —"
                        searchPlaceholder="Поиск услуги"
                        onCommit={(id) => handlePatch(t.id, { service_id: id })}
                      />
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      <InlineEditSelect
                        align="right"
                        value={t.tax_rate_id}
                        options={taxOptions}
                        noneLabel="— Без налога —"
                        searchPlaceholder="Поиск ставки"
                        emptyText={
                          t.tax_rate == null
                            ? '—'
                            : `${Number(t.tax_rate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`
                        }
                        onCommit={(id) => {
                          const rate = id ? taxRateById(id) : null
                          handlePatch(t.id, { tax_rate_id: id, tax_rate: rate })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineEditCell
                        type="number"
                        align="right"
                        value={Number(t.amount)}
                        format={(v) => (typeof v === 'number' ? fmt(v) : '—')}
                        min={0.01}
                        onCommit={(v) => {
                          if (v <= 0) return
                          handlePatch(t.id, { amount: v })
                        }}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <InlineEditCell
                        type="text"
                        value={t.comment ?? ''}
                        emptyText="—"
                        placeholder="Комментарий"
                        onCommit={(v) => {
                          const trimmed = v.trim()
                          const next = trimmed === '' ? null : trimmed
                          if (next === t.comment) return
                          handlePatch(t.id, { comment: next })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-gray-900"
                          onClick={() => openEdit(t)}
                          aria-label="Редактировать"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-gray-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => askDelete(t)}
                          disabled={deleteMutation.isPending}
                          aria-label="Удалить"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          {/* Footer-теги без боковых разделителей.
              Цвет тега «Итого» зависит от типа: доход — синий, расход — красный. */}
          <div className="px-3 py-2 flex items-center justify-end gap-2 text-sm tabular-nums">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${
                type === 'income'
                  ? 'bg-blue-100 text-blue-900'
                  : 'bg-red-100 text-red-900'
              }`}
            >
              <span>Итого:</span>
              <span className="font-semibold">{fmt(totalSum)} EUR</span>
            </span>
          </div>
          </>
        )}
      </div>

      <ProjectTransactionFormDialog
        key={editing?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        type={type}
        editing={editing}
        onSave={handleSave}
        saving={createMutation.isPending || updateMutation.isPending}
        suggestedAmount={remainingAmount}
        suggestedLabel="Остаток"
      />

      <ConfirmDialog
        state={confirm.state}
        onConfirm={confirm.handleConfirm}
        onCancel={confirm.handleCancel}
      />
    </section>
  )
}
