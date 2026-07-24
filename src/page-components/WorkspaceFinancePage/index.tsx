"use client"

/**
 * Страница «Финансы» воркспейса — общий хронологический журнал доходов и
 * расходов по всем проектам + добавление операций из одного места.
 *
 * Доступ: владелец или право manage_workspace_settings (тот же гейт, что у
 * пункта сайдбара nav:finance). RLS project_transactions шире (все участники
 * воркспейса), поэтому гейт — продуктовый, на уровне UI.
 *
 * Лента — строки-«квитанции» (как на вкладке «Финансы» проекта), сгруппированы
 * по месяцам, редактирование/удаление — через диалог (карандаш в строке).
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ExternalLink,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { InlineEditCell } from '@/components/ui/inline-edit-cell'
import { InlineEditSelect } from '@/components/ui/inline-edit-select'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { SegmentedToggle } from '@/components/ui/segmented-toggle'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import { ChatSettingsProjectSelector } from '@/components/messenger/ChatSettingsProjectSelector'
import {
  useFinanceTxCategories,
  useCreateFinanceTxCategory,
} from '@/hooks/finance/useFinanceTransactionCategories'
import { useWorkspaceCurrency } from '@/hooks/finance/useCurrencySettings'
import { formatMoney, formatMoneyByCurrency } from '@/lib/currency'
import {
  useWorkspaceTransactions,
  useUpdateWorkspaceTransaction,
  useDeleteWorkspaceTransaction,
  usePatchWorkspaceTransaction,
  type WorkspaceTransaction,
  type WorkspaceTransactionPatch,
} from '@/hooks/finance/useWorkspaceTransactions'
import type {
  ProjectTransactionFormData,
  TransactionType,
} from '@/hooks/projects/useProjectTransactions'
import { ProjectTransactionFormDialog } from '@/components/projects/finance/ProjectTransactionFormDialog'
import { WorkspaceTransactionCreateDialog } from '@/components/projects/finance/WorkspaceTransactionCreateDialog'
import { formatDateToString, formatIsoDateNumeric } from '@/utils/format/dateFormat'

type TypeFilter = 'all' | TransactionType
type PeriodFilter = 'all' | 'this_month' | 'last_month' | 'this_year'

/** Границы периода [from, to] в ISO-датах (включительно), null = без границы. */
function periodRange(period: PeriodFilter): { from: string | null; to: string | null } {
  if (period === 'all') return { from: null, to: null }
  const now = new Date()
  if (period === 'this_month') {
    return { from: formatDateToString(new Date(now.getFullYear(), now.getMonth(), 1)), to: null }
  }
  if (period === 'last_month') {
    return {
      from: formatDateToString(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
      to: formatDateToString(new Date(now.getFullYear(), now.getMonth(), 0)),
    }
  }
  // this_year
  return { from: formatDateToString(new Date(now.getFullYear(), 0, 1)), to: null }
}

/** «июль 2026 г.» → «Июль 2026». */
function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const label = new Date(y, m - 1, 1).toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  })
  const cleaned = label.replace(/\s*г\.$/, '')
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

type MonthGroup = {
  key: string
  /** Суммы в разрезе валют (проекты могут быть в разных валютах). */
  income: Map<string, number>
  expense: Map<string, number>
  items: WorkspaceTransaction[]
}

const addTo = (map: Map<string, number>, code: string, value: number) =>
  map.set(code, (map.get(code) ?? 0) + value)

export default function WorkspaceFinancePage() {
  usePageTitle('Финансы')
  const { workspaceId } = useParams<{ workspaceId: string }>()

  const { isOwner, can } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  const canView = isOwner || can('manage_workspace_settings')
  const { baseCurrency } = useWorkspaceCurrency(canView ? workspaceId : undefined)

  const { data: transactions = [], isLoading } = useWorkspaceTransactions(
    canView ? workspaceId : undefined,
  )
  // Тот же список, что в селекторе проекта карточки треда: по свежести
  // активности + template_id/status_id для резолва иконок как в сайдбаре.
  const { data: projects = [] } = useWorkspaceProjects(canView ? workspaceId : undefined)
  const { data: participants = [] } = useWorkspaceParticipants(canView ? workspaceId : undefined)
  const { data: incomeCategories = [] } = useFinanceTxCategories(
    canView ? workspaceId : undefined,
    'income',
  )
  const { data: expenseCategories = [] } = useFinanceTxCategories(
    canView ? workspaceId : undefined,
    'expense',
  )

  // Опции инлайн-селектов строки журнала.
  const participantOptions = useMemo(
    () =>
      participants.map((p) => ({
        value: p.id,
        label: [p.name, p.last_name].filter(Boolean).join(' ') || p.name,
        hint: p.email ?? undefined,
      })),
    [participants],
  )
  const categoryOptionsByType = useMemo(
    () => ({
      income: incomeCategories.map((c) => ({ value: c.id, label: c.name })),
      expense: expenseCategories.map((c) => ({ value: c.id, label: c.name })),
    }),
    [incomeCategories, expenseCategories],
  )

  // ---- Фильтры ----
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [projectFilter, setProjectFilter] = useState<string | null>(null)
  const [period, setPeriod] = useState<PeriodFilter>('all')

  const filtered = useMemo(() => {
    const { from, to } = periodRange(period)
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (projectFilter && t.project_id !== projectFilter) return false
      if (from && t.date < from) return false
      if (to && t.date > to) return false
      return true
    })
  }, [transactions, typeFilter, projectFilter, period])

  // Валюта строки = валюта её проекта (NULL = базовая воркспейса).
  const rowCurrency = (t: WorkspaceTransaction) => t.project_currency ?? baseCurrency

  // Итоги в разрезе валют — без конвертации и курсов.
  const totals = useMemo(() => {
    const income = new Map<string, number>()
    const expense = new Map<string, number>()
    const balance = new Map<string, number>()
    for (const t of filtered) {
      const cur = t.project_currency ?? baseCurrency
      const amount = Number(t.amount ?? 0)
      if (t.type === 'income') {
        addTo(income, cur, amount)
        addTo(balance, cur, amount)
      } else {
        addTo(expense, cur, amount)
        addTo(balance, cur, -amount)
      }
    }
    const balanceNonNegative = [...balance.values()].every((v) => v >= 0)
    return { income, expense, balance, balanceNonNegative }
  }, [filtered, baseCurrency])

  // Группировка по месяцам — порядок уже date DESC из запроса.
  const groups = useMemo(() => {
    const result: MonthGroup[] = []
    for (const t of filtered) {
      const key = t.date.slice(0, 7)
      let group = result[result.length - 1]
      if (!group || group.key !== key) {
        group = { key, income: new Map(), expense: new Map(), items: [] }
        result.push(group)
      }
      group.items.push(t)
      const cur = t.project_currency ?? baseCurrency
      if (t.type === 'income') addTo(group.income, cur, Number(t.amount ?? 0))
      else addTo(group.expense, cur, Number(t.amount ?? 0))
    }
    return result
  }, [filtered, baseCurrency])

  // ---- Диалоги: создание (обёртка с мутацией) и редактирование ----
  const [createDialog, setCreateDialog] = useState<{ open: boolean; type: TransactionType }>({
    open: false,
    type: 'income',
  })
  const [editing, setEditing] = useState<WorkspaceTransaction | null>(null)

  const updateMutation = useUpdateWorkspaceTransaction(workspaceId)
  const deleteMutation = useDeleteWorkspaceTransaction(workspaceId)
  const patchMutation = usePatchWorkspaceTransaction(workspaceId)
  const confirm = useConfirmDialog()

  // Создание статьи прямо из инлайн-селектора (строка «+ Создать „…“»).
  const createIncomeCategory = useCreateFinanceTxCategory(workspaceId, 'income')
  const createExpenseCategory = useCreateFinanceTxCategory(workspaceId, 'expense')
  const createCategory = async (
    kind: TransactionType,
    name: string,
  ): Promise<string | null> => {
    try {
      const mutation = kind === 'income' ? createIncomeCategory : createExpenseCategory
      const created = await mutation.mutateAsync({ name })
      return created.id
    } catch (e) {
      toast.error('Не удалось создать статью', { description: getUserFacingErrorMessage(e) })
      return null
    }
  }

  const handlePatch = (t: WorkspaceTransaction, patch: WorkspaceTransactionPatch) => {
    const projectIds = [t.project_id, patch.project_id].filter(
      (id): id is string => typeof id === 'string',
    )
    patchMutation.mutate(
      { id: t.id, patch, projectIds },
      {
        onError: (e) =>
          toast.error('Не удалось сохранить', { description: getUserFacingErrorMessage(e) }),
      },
    )
  }

  const openCreate = (type: TransactionType) => {
    setEditing(null)
    setCreateDialog({ open: true, type })
  }
  const openEdit = (t: WorkspaceTransaction) => {
    setEditing(t)
  }

  const handleSave = (form: ProjectTransactionFormData, projectId?: string | null) => {
    if (!editing) return
    if (!projectId) {
      toast.error('Выбери проект')
      return
    }
    if (form.amount <= 0) {
      toast.error('Сумма должна быть больше нуля')
      return
    }
    updateMutation.mutate(
      { id: editing.id, projectId, prevProjectId: editing.project_id, form },
      {
        onSuccess: () => {
          toast.success('Сохранено')
          setEditing(null)
        },
        onError: (e: unknown) =>
          toast.error('Не удалось сохранить', { description: getUserFacingErrorMessage(e) }),
      },
    )
  }

  const askDelete = async (t: WorkspaceTransaction) => {
    const ok = await confirm.confirm({
      title: t.type === 'income' ? 'Удалить доход?' : 'Удалить расход?',
      description: `Запись на ${formatMoney(Number(t.amount), rowCurrency(t))} от ${formatIsoDateNumeric(t.date)} (${t.project_name}) будет удалена.`,
      confirmText: 'Удалить',
      variant: 'destructive',
    })
    if (!ok) return
    deleteMutation.mutate(
      { id: t.id, projectId: t.project_id },
      {
        onSuccess: () => toast.success('Удалено'),
        onError: (e) =>
          toast.error('Не удалось удалить', { description: getUserFacingErrorMessage(e) }),
      },
    )
  }

  if (!canView) {
    return (
      <WorkspaceLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-gray-500">
            <Lock className="h-8 w-8" />
            <div className="text-sm">Раздел доступен владельцу и администраторам воркспейса</div>
          </div>
        </div>
      </WorkspaceLayout>
    )
  }

  return (
    <WorkspaceLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-gray-900">Финансы</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" onClick={() => openCreate('income')}>
              <Plus className="h-4 w-4 mr-1" />
              Доход
            </Button>
            <Button size="sm" variant="outline" onClick={() => openCreate('expense')}>
              <Plus className="h-4 w-4 mr-1" />
              Расход
            </Button>
          </div>
        </div>

        {/* Фильтры + итоги по отфильтрованному набору */}
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedToggle<TypeFilter>
            options={[
              { value: 'all', label: 'Все' },
              { value: 'income', label: 'Доходы' },
              { value: 'expense', label: 'Расходы' },
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
          <SegmentedToggle<PeriodFilter>
            options={[
              { value: 'all', label: 'Всё время' },
              { value: 'this_month', label: 'Месяц' },
              { value: 'last_month', label: 'Прошлый месяц' },
              { value: 'this_year', label: 'Год' },
            ]}
            value={period}
            onChange={setPeriod}
          />
          <div className="w-56">
            <SearchableSelect
              value={projectFilter}
              onChange={setProjectFilter}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
              placeholder="Все проекты"
              noneLabel="— Все проекты —"
              searchPlaceholder="Поиск проекта"
              emptyText="Проектов не нашли"
            />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm tabular-nums">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-2.5 py-0.5 text-blue-900">
              <span>Доходы:</span>
              <span className="font-semibold">{formatMoneyByCurrency(totals.income)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-red-900">
              <span>Расходы:</span>
              <span className="font-semibold">{formatMoneyByCurrency(totals.expense)}</span>
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 ${
                totals.balanceNonNegative ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'
              }`}
            >
              <span>Сальдо:</span>
              <span className="font-semibold">{formatMoneyByCurrency(totals.balance)}</span>
            </span>
          </div>
        </div>

        {isLoading || filtered.length === 0 ? (
          <EmptyState
            loading={isLoading}
            emptyText={
              transactions.length === 0
                ? 'Операций пока нет — добавь первый доход или расход'
                : 'Под фильтры ничего не попало'
            }
          />
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key}>
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <h2 className="text-sm font-semibold text-gray-900">{monthLabel(group.key)}</h2>
                  <div className="text-xs text-gray-500 tabular-nums">
                    {group.income.size > 0 && (
                      <span className="text-blue-700">+{formatMoneyByCurrency(group.income)}</span>
                    )}
                    {group.income.size > 0 && group.expense.size > 0 && (
                      <span className="text-gray-300"> · </span>
                    )}
                    {group.expense.size > 0 && (
                      <span className="text-red-700">−{formatMoneyByCurrency(group.expense)}</span>
                    )}
                  </div>
                </div>
                <div className="rounded-lg border divide-y overflow-hidden">
                  {/* Одна строка, все поля редактируются кликом на месте:
                      дата · проект · статья · контрагент · [⋯] … сумма.
                      Комментарий и налог — через диалог (⋯ → Редактировать),
                      полный комментарий виден в title строки. */}
                  {group.items.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 px-3 py-2 group/row"
                      title={t.comment?.trim() || undefined}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                          t.type === 'income'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                        title={t.type === 'income' ? 'Доход' : 'Расход'}
                      >
                        {t.type === 'income' ? (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="w-24 shrink-0">
                        <InlineEditCell
                          type="date"
                          value={t.date}
                          className="text-xs text-gray-500"
                          onCommit={(v) => {
                            if (!v || v === t.date) return
                            handlePatch(t, { date: v })
                          }}
                        />
                      </div>
                      <div className="min-w-0 max-w-[30%] shrink overflow-hidden">
                        <ChatSettingsProjectSelector
                          workspaceProjects={projects}
                          selectedProjectId={t.project_id}
                          isEditMode
                          workspaceId={workspaceId}
                          onSelect={(id) => {
                            // «Без проекта» для операции недопустимо — у
                            // транзакции проект обязателен.
                            if (!id) {
                              toast.error('У операции должен быть проект')
                              return
                            }
                            if (id !== t.project_id) handlePatch(t, { project_id: id })
                          }}
                          triggerClassName="flex items-center gap-1.5 max-w-full min-w-0 whitespace-nowrap text-sm font-semibold text-gray-900 rounded px-1 py-0.5 -my-0.5 hover:bg-gray-100 transition-colors"
                          iconClassName="w-3.5 h-3.5 text-gray-400 shrink-0"
                        />
                      </div>
                      <span className="text-gray-300 select-none">·</span>
                      <div className="min-w-0 max-w-[22%] shrink">
                        <InlineEditSelect
                          value={t.category_id}
                          options={categoryOptionsByType[t.type as TransactionType]}
                          className="text-gray-600"
                          emptyText="Статья…"
                          noneLabel="— Не указана —"
                          searchPlaceholder="Поиск статьи"
                          onCommit={(id) => handlePatch(t, { category_id: id })}
                          onCreate={(name) => createCategory(t.type as TransactionType, name)}
                          createLabel="Новая статья"
                        />
                      </div>
                      <span className="text-gray-300 select-none">·</span>
                      <div className="min-w-0 max-w-[22%] shrink">
                        <InlineEditSelect
                          value={t.participant_id}
                          options={participantOptions}
                          className="text-gray-600"
                          emptyText="—"
                          noneLabel="— Не указан —"
                          searchPlaceholder="Поиск по имени или email"
                          popoverEmpty="Никого не нашли"
                          onCommit={(id) => handlePatch(t, { participant_id: id })}
                        />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0 text-gray-400 hover:text-gray-900 md:opacity-0 md:group-hover/row:opacity-100 data-[state=open]:opacity-100 transition-opacity"
                            aria-label="Действия"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link
                              href={`/workspaces/${workspaceId}/projects/${t.project_id}?tab=finances`}
                            >
                              <ExternalLink className="h-4 w-4 mr-2" />
                              Открыть проект
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => askDelete(t)}
                            disabled={deleteMutation.isPending}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Удалить
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <div className="ml-auto w-28 shrink-0">
                        <InlineEditCell
                          type="number"
                          align="right"
                          value={Number(t.amount)}
                          format={(v) =>
                            typeof v === 'number'
                              ? `${t.type === 'income' ? '+' : '−'}${formatMoney(v, rowCurrency(t))}`
                              : '—'
                          }
                          min={0.01}
                          className={`font-medium tabular-nums ${
                            t.type === 'income' ? 'text-blue-700' : 'text-red-700'
                          }`}
                          onCommit={(v) => {
                            if (v <= 0 || v === Number(t.amount)) return
                            handlePatch(t, { amount: v })
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {createDialog.open && (
        <WorkspaceTransactionCreateDialog
          key={`new-${createDialog.type}`}
          open={createDialog.open}
          onOpenChange={(open) => setCreateDialog((d) => ({ ...d, open }))}
          workspaceId={workspaceId}
          type={createDialog.type}
          initialProjectId={projectFilter}
        />
      )}

      {editing && (
        <ProjectTransactionFormDialog
          key={editing.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          workspaceId={workspaceId}
          type={editing.type as TransactionType}
          editing={editing}
          onSave={handleSave}
          saving={updateMutation.isPending}
          projects={projects}
          baseCurrency={baseCurrency}
          initialProjectId={editing.project_id}
        />
      )}

      <ConfirmDialog
        state={confirm.state}
        onConfirm={confirm.handleConfirm}
        onCancel={confirm.handleCancel}
      />
    </WorkspaceLayout>
  )
}
