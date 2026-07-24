/**
 * ProjectTransactionFormDialog — добавление/редактирование транзакций
 * (доход или расход). Контрагент и статья — необязательные.
 *
 * Создание — многострочное: проект (в режиме общего журнала) выбирается один
 * раз, ниже — записи таблицей. Каждая запись занимает две строки:
 *   1) Дата · Статья · Налог · Сумма
 *   2) Кому/От кого · Комментарий
 * «+ Ещё строка» добавляет запись; сохранение создаёт все заполненные разом.
 * Редактирование — та же вёрстка, но ровно одна запись без добавления строк.
 */

import { useMemo, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ChatSettingsProjectSelector } from '@/components/messenger/ChatSettingsProjectSelector'
import { cn } from '@/lib/utils'
import { currencySymbol, DEFAULT_CURRENCY, formatAmount } from '@/lib/currency'
import { useFinanceTxCategories } from '@/hooks/finance/useFinanceTransactionCategories'
import { useFinanceTaxRates } from '@/hooks/finance/useFinanceTaxRates'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import {
  isRowBlank,
  isRowValid,
  rowAmount,
  type TransactionEntryRow as EntryRow,
} from '@/lib/finance/transactionEntryRow'
import type { WorkspaceProjectOption } from '@/components/messenger/hooks/useChatSettingsData'
import type {
  ProjectTransaction,
  ProjectTransactionFormData,
  TransactionType,
} from '@/hooks/projects/useProjectTransactions'

const TYPE_LABELS: Record<TransactionType, { full: string; subject: string }> = {
  income: { full: 'доход', subject: 'От кого' },
  expense: { full: 'расход', subject: 'Кому' },
}

const todayISO = (): string => new Date().toISOString().slice(0, 10)

const fullName = (p: { name: string; last_name: string | null }): string =>
  [p.name, p.last_name].filter(Boolean).join(' ') || p.name

/* Сетка первой строки записи: Дата | Статья | Налог | Сумма | (×).
   Заголовки колонок используют тот же template, чтобы совпадать по ширине. */
const ROW_GRID = 'grid grid-cols-[8.75rem_minmax(0,1fr)_minmax(0,8.5rem)_6.5rem_1.5rem] gap-2'
/* Правый отступ второй строки записи = последняя колонка ROW_GRID (кнопка «×»,
   1.5rem) + gap-2 (0.5rem) — чтобы поля не заезжали под кнопку удаления.
   При изменении ширины колонки «×» или gap в ROW_GRID — править синхронно. */
const ROW_TRAILING_PAD = 'pr-[calc(1.5rem+0.5rem)]'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  type: TransactionType
  editing: ProjectTransaction | null
  /** Сохранение при редактировании (одна запись). Обязателен, если editing задан. */
  onSave?: (form: ProjectTransactionFormData, projectId?: string | null) => void
  /** Создание — все заполненные записи разом. Обязателен, если editing НЕ задан. */
  onSaveMany?: (forms: ProjectTransactionFormData[], projectId?: string | null) => void
  saving: boolean
  /**
   * Подсказка-сумма (например, остаток к оплате для дохода). Если задано
   * и > 0, над таблицей появляется кликабельный тег — клик подставляет
   * значение в первую запись без суммы.
   */
  suggestedAmount?: number | null
  /** Подпись тега (например, «Остаток»). */
  suggestedLabel?: string
  /**
   * Список проектов — если задан, в форме появляется обязательное поле
   * «Проект» (режим общего журнала воркспейса), выбранный id уходит
   * вторым аргументом onSave/onSaveMany. На вкладке проекта проп не передаётся.
   */
  projects?: WorkspaceProjectOption[]
  /** Стартовый проект (при редактировании — проект операции). */
  initialProjectId?: string | null
  /**
   * Дефолтный контрагент для НОВОЙ операции (например, клиент проекта для
   * дохода). При редактировании игнорируется — берётся контрагент операции.
   */
  defaultParticipantId?: string | null
  /** Валюта проекта (режим вкладки проекта). */
  currency?: string
  /** Базовая валюта воркспейса — фолбэк для проектов без явной валюты
   *  (режим общего журнала). */
  baseCurrency?: string
}

export function ProjectTransactionFormDialog({
  open,
  onOpenChange,
  workspaceId,
  type,
  editing,
  onSave,
  onSaveMany,
  saving,
  suggestedAmount,
  suggestedLabel = 'Остаток',
  projects,
  initialProjectId,
  defaultParticipantId,
  currency,
  baseCurrency,
}: Props) {
  const { data: categories = [] } = useFinanceTxCategories(workspaceId, type)
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)
  const { data: taxRates = [] } = useFinanceTaxRates(workspaceId)
  const defaultTax = taxRates.find((t) => t.is_default)

  // Инициализация — пересоздание через key={editing?.id ?? 'new-…'} снаружи.
  const [rows, setRows] = useState<EntryRow[]>(() => [
    editing
      ? {
          key: 0,
          date: editing.date,
          categoryId: editing.category_id,
          taxRateId: editing.tax_rate_id,
          amountText: String(editing.amount),
          participantId: editing.participant_id,
          comment: editing.comment ?? '',
        }
      : {
          key: 0,
          date: todayISO(),
          categoryId: null,
          taxRateId: defaultTax?.id ?? null,
          amountText: '',
          participantId: defaultParticipantId ?? null,
          comment: '',
        },
  ])
  const [nextKey, setNextKey] = useState(1)
  const [projectId, setProjectId] = useState<string | null>(initialProjectId ?? null)
  const showProjectField = projects !== undefined

  // Валюта: на вкладке проекта приходит пропом; в общем журнале — по
  // выбранному проекту с фолбэком на базовую воркспейса.
  const effectiveCurrency = showProjectField
    ? (projects?.find((p) => p.id === projectId)?.currency ??
      baseCurrency ??
      DEFAULT_CURRENCY)
    : (currency ?? DEFAULT_CURRENCY)

  const labels = TYPE_LABELS[type]

  const participantOptions = useMemo(
    () =>
      participants.map((p) => ({
        value: p.id,
        label: fullName(p),
        hint: p.email ?? undefined,
      })),
    [participants],
  )
  const categoryOptions = useMemo(
    () => categories.map((c) => ({ value: c.id, label: c.name })),
    [categories],
  )
  const taxOptions = useMemo(
    () => taxRates.map((t) => ({ value: t.id, label: t.name, hint: `${Number(t.rate)}%` })),
    [taxRates],
  )

  const patchRow = (key: number, patch: Partial<EntryRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        key: nextKey,
        // Дату наследуем от последней строки — обычно вносят операции одного дня.
        date: prev[prev.length - 1]?.date ?? todayISO(),
        categoryId: null,
        taxRateId: defaultTax?.id ?? null,
        amountText: '',
        participantId: defaultParticipantId ?? null,
        comment: '',
      },
    ])
    setNextKey((k) => k + 1)
  }

  const removeRow = (key: number) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev))

  const toForm = (row: EntryRow): ProjectTransactionFormData => {
    const selectedTax = taxRates.find((t) => t.id === row.taxRateId)
    return {
      type,
      date: row.date,
      participant_id: row.participantId,
      category_id: row.categoryId,
      amount: rowAmount(row),
      comment: row.comment.trim() || null,
      tax_rate_id: row.taxRateId,
      tax_rate: selectedTax ? Number(selectedTax.rate) : null,
    }
  }

  // Заполненные записи: пустые строки-заготовки игнорируются, но строка с
  // данными без корректной суммы блокирует сохранение (ничего молча не теряем).
  const filledRows = rows.filter((r) => !isRowBlank(r))
  // Проект обязателен в обоих режимах: пикер позволяет «Без проекта»
  // (снять выбор), но операция без проекта не сохраняется.
  const projectChosen = !showProjectField || !!projectId
  const canSave = editing
    ? isRowValid(rows[0]) && projectChosen
    : filledRows.length > 0 && filledRows.every(isRowValid) && projectChosen

  const handleSubmit = () => {
    if (editing) {
      onSave?.(toForm(rows[0]), projectId)
    } else {
      onSaveMany?.(filledRows.map(toForm), projectId)
    }
  }

  const hasSuggestion =
    typeof suggestedAmount === 'number' && Number.isFinite(suggestedAmount) && suggestedAmount > 0

  // Клик по тегу-подсказке — в первую запись без суммы (иначе в последнюю).
  const applySuggestion = () => {
    const target = rows.find((r) => r.amountText.trim() === '') ?? rows[rows.length - 1]
    if (target) patchRow(target.key, { amountText: String(suggestedAmount) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Редактировать ${labels.full}` : `Новый ${labels.full}`}
          </DialogTitle>
          <DialogDescription>
            Контрагент и статья — необязательны. Можно вписать только сумму и дату.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {showProjectField && (
            <div className="flex items-center gap-2">
              <Label className="text-base">Проект:</Label>
              {/* Тот же пикер, что в шапке треда: единый список с иконками
                  проектов + «+» создать проект из шаблона. «Без проекта»
                  просто снимает выбор — без проекта операцию не сохранить. */}
              <ChatSettingsProjectSelector
                workspaceProjects={projects ?? []}
                selectedProjectId={projectId}
                isEditMode
                workspaceId={workspaceId}
                onSelect={setProjectId}
                label="Выбрать проект"
                triggerClassName={cn(
                  'flex items-center gap-1.5 text-base font-semibold rounded px-2 py-1 transition-colors shrink-0',
                  projectId
                    ? 'text-brand-700 bg-brand-100/75 hover:bg-brand-100'
                    : 'text-brand-500/70 hover:text-brand-600 hover:bg-brand-100/75',
                )}
                iconClassName="w-4 h-4"
              />
            </div>
          )}

          {hasSuggestion && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={applySuggestion}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 hover:bg-blue-200 px-2 py-0.5 text-xs text-blue-900 transition-colors"
                title="Подставить сумму в запись без суммы"
              >
                <span>{suggestedLabel}:</span>
                <span className="font-semibold tabular-nums">
                  {formatAmount(suggestedAmount as number)}
                </span>
              </button>
            </div>
          )}

          {/* Заголовки колонок первой строки записи. */}
          <div className={`${ROW_GRID} px-3 text-xs font-medium text-gray-500`}>
            <span>Дата</span>
            <span>Статья (за что)</span>
            <span>Налог</span>
            <span>Сумма, {currencySymbol(effectiveCurrency)}</span>
            <span />
          </div>

          <div className="rounded-md border divide-y">
            {rows.map((row) => (
              <div key={row.key} className="p-3 space-y-2">
                <div className={`${ROW_GRID} items-center`}>
                  <Input
                    type="date"
                    aria-label="Дата"
                    value={row.date}
                    onChange={(e) => patchRow(row.key, { date: e.target.value })}
                    // Клик по любому месту поля открывает нативный календарь —
                    // иначе Chrome ждёт клика точно по иконке-индикатору.
                    onClick={(e) => {
                      try {
                        e.currentTarget.showPicker?.()
                      } catch {
                        /* Не поддерживается/запрещено — остаётся ручной ввод. */
                      }
                    }}
                    className="h-9 cursor-pointer"
                  />
                  <SearchableSelect
                    value={row.categoryId}
                    onChange={(id) => patchRow(row.key, { categoryId: id })}
                    options={categoryOptions}
                    placeholder="Не указана"
                    noneLabel="— Не указана —"
                    searchPlaceholder="Поиск статьи"
                    emptyText={
                      categories.length === 0
                        ? type === 'income'
                          ? 'Справочник статей доходов пуст'
                          : 'Справочник статей расходов пуст'
                        : 'Ничего не нашли'
                    }
                  />
                  <SearchableSelect
                    value={row.taxRateId}
                    onChange={(id) => patchRow(row.key, { taxRateId: id })}
                    options={taxOptions}
                    placeholder="Без налога"
                    noneLabel="— Без налога —"
                    searchPlaceholder="Поиск ставки"
                    emptyText={taxRates.length === 0 ? 'Справочник налогов пуст' : 'Ничего не нашли'}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    aria-label="Сумма"
                    min={0}
                    step="0.01"
                    value={row.amountText}
                    onChange={(e) => patchRow(row.key, { amountText: e.target.value })}
                    placeholder="0.00"
                    className="h-9 text-right tabular-nums"
                  />
                  {!editing && rows.length > 1 ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-red-600"
                      onClick={() => removeRow(row.key)}
                      aria-label="Убрать строку"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
                {/* Вторая строка записи: контрагент + комментарий. */}
                <div
                  className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2 ${ROW_TRAILING_PAD}`}
                >
                  <SearchableSelect
                    value={row.participantId}
                    onChange={(id) => patchRow(row.key, { participantId: id })}
                    options={participantOptions}
                    placeholder={labels.subject}
                    noneLabel="— Не указан —"
                    searchPlaceholder="Поиск по имени или email"
                    emptyText="Никого не нашли"
                  />
                  <Input
                    type="text"
                    aria-label="Комментарий"
                    value={row.comment}
                    onChange={(e) => patchRow(row.key, { comment: e.target.value })}
                    placeholder="Комментарий"
                    className="h-9"
                  />
                </div>
              </div>
            ))}
          </div>

          {!editing && (
            <Button variant="ghost" size="sm" onClick={addRow} className="text-gray-600">
              <Plus className="h-4 w-4 mr-1" />
              Ещё строка
            </Button>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSave}>
            {saving
              ? 'Сохранение…'
              : editing
                ? 'Сохранить'
                : filledRows.length > 1
                  ? `Добавить (${filledRows.length})`
                  : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
