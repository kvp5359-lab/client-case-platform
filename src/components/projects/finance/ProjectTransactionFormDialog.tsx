/**
 * ProjectTransactionFormDialog — добавление/редактирование транзакции
 * (доход или расход). Контрагент и статья — необязательные.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { currencySymbol, DEFAULT_CURRENCY, formatAmount } from '@/lib/currency'
import { useFinanceTxCategories } from '@/hooks/finance/useFinanceTransactionCategories'
import { useFinanceTaxRates } from '@/hooks/finance/useFinanceTaxRates'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  type: TransactionType
  editing: ProjectTransaction | null
  onSave: (form: ProjectTransactionFormData, projectId?: string | null) => void
  saving: boolean
  /**
   * Подсказка-сумма (например, остаток к оплате для дохода). Если задано
   * и > 0, рядом с полем «Сумма» появляется кликабельный тег — клик
   * подставляет это значение в поле.
   */
  suggestedAmount?: number | null
  /** Подпись тега (например, «Остаток»). */
  suggestedLabel?: string
  /**
   * Список проектов — если задан, в форме появляется обязательное поле
   * «Проект» (режим общего журнала воркспейса), выбранный id уходит
   * вторым аргументом onSave. На вкладке проекта проп не передаётся.
   */
  projects?: { id: string; name: string; currency?: string | null }[]
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

  // Инициализация — пересоздание через key={editing?.id ?? 'new'} снаружи.
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [participantId, setParticipantId] = useState<string | null>(
    editing ? editing.participant_id : (defaultParticipantId ?? null),
  )
  const [categoryId, setCategoryId] = useState<string | null>(editing?.category_id ?? null)
  const [amountText, setAmountText] = useState(editing ? String(editing.amount) : '')
  const [comment, setComment] = useState(editing?.comment ?? '')
  const [taxRateId, setTaxRateId] = useState<string | null>(
    editing ? editing.tax_rate_id : (defaultTax?.id ?? null),
  )
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

  const selectedTax = taxRates.find((t) => t.id === taxRateId)

  const handleSubmit = () => {
    const amount = Number(amountText.replace(',', '.'))
    onSave(
      {
        type,
        date,
        participant_id: participantId,
        category_id: categoryId,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        comment: comment.trim() || null,
        tax_rate_id: taxRateId,
        tax_rate: selectedTax ? Number(selectedTax.rate) : null,
      },
      projectId,
    )
  }

  const amountNum = Number(amountText.replace(',', '.')) || 0
  const canSave = amountNum > 0 && !!date && (!showProjectField || !!projectId)

  const hasSuggestion =
    typeof suggestedAmount === 'number' && Number.isFinite(suggestedAmount) && suggestedAmount > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editing ? `Редактировать ${labels.full}` : `Новый ${labels.full}`}
          </DialogTitle>
          <DialogDescription>
            Контрагент и статья — необязательны. Можно вписать только сумму и дату.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {showProjectField && (
            <div className="space-y-1.5">
              <Label htmlFor="trx-project">Проект</Label>
              <SearchableSelect
                id="trx-project"
                value={projectId}
                onChange={setProjectId}
                options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
                placeholder="Выбери проект"
                noneLabel={null}
                searchPlaceholder="Поиск проекта"
                emptyText="Проектов не нашли"
              />
            </div>
          )}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label htmlFor="trx-date">Дата</Label>
              <Input
                id="trx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label htmlFor="trx-amount">
                Сумма, {currencySymbol(effectiveCurrency)}
                {hasSuggestion && (
                  <button
                    type="button"
                    onClick={() => setAmountText(String(suggestedAmount))}
                    className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-100 hover:bg-blue-200 px-2 py-0.5 text-xs font-normal text-blue-900 transition-colors align-middle"
                    title="Подставить сумму в поле"
                  >
                    <span>{suggestedLabel}:</span>
                    <span className="font-semibold tabular-nums">{formatAmount(suggestedAmount as number)}</span>
                  </button>
                )}
              </Label>
              <Input
                id="trx-amount"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amountText}
                onChange={(e) => setAmountText(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trx-participant">{labels.subject}</Label>
            <SearchableSelect
              id="trx-participant"
              value={participantId}
              onChange={setParticipantId}
              options={participants.map((p) => ({
                value: p.id,
                label: fullName(p),
                hint: p.email ?? undefined,
              }))}
              placeholder="Не указан"
              noneLabel="— Не указан —"
              searchPlaceholder="Поиск по имени или email"
              emptyText="Никого не нашли"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label htmlFor="trx-category">Статья (за что)</Label>
              <SearchableSelect
                id="trx-category"
                value={categoryId}
                onChange={setCategoryId}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
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
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <Label htmlFor="trx-tax">Налог</Label>
              <SearchableSelect
                id="trx-tax"
                value={taxRateId}
                onChange={setTaxRateId}
                options={taxRates.map((t) => ({
                  value: t.id,
                  label: t.name,
                  hint: `${Number(t.rate)}%`,
                }))}
                placeholder="Без налога"
                noneLabel="— Без налога —"
                searchPlaceholder="Поиск ставки"
                emptyText={
                  taxRates.length === 0 ? 'Справочник налогов пуст' : 'Ничего не нашли'
                }
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="trx-comment">Комментарий</Label>
            <Textarea
              id="trx-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Опционально"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !canSave}>
            {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Добавить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
