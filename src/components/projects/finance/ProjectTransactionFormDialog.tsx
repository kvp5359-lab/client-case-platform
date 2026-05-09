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
import { useFinanceServices } from '@/hooks/useFinanceServices'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import type {
  ProjectTransaction,
  ProjectTransactionFormData,
  TransactionType,
} from '@/hooks/useProjectTransactions'

const TYPE_LABELS: Record<TransactionType, { full: string; subject: string }> = {
  income: { full: 'доход', subject: 'От кого' },
  expense: { full: 'расход', subject: 'Кому' },
}

const todayISO = (): string => new Date().toISOString().slice(0, 10)

const fullName = (p: { name: string; last_name: string | null }): string =>
  [p.name, p.last_name].filter(Boolean).join(' ') || p.name

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  type: TransactionType
  editing: ProjectTransaction | null
  onSave: (form: ProjectTransactionFormData) => void
  saving: boolean
}

export function ProjectTransactionFormDialog({
  open,
  onOpenChange,
  workspaceId,
  type,
  editing,
  onSave,
  saving,
}: Props) {
  const { data: catalog = [] } = useFinanceServices(workspaceId)
  const { data: participants = [] } = useWorkspaceParticipants(workspaceId)

  // Инициализация — пересоздание через key={editing?.id ?? 'new'} снаружи.
  const [date, setDate] = useState(editing?.date ?? todayISO())
  const [participantId, setParticipantId] = useState<string | null>(
    editing?.participant_id ?? null,
  )
  const [serviceId, setServiceId] = useState<string | null>(editing?.service_id ?? null)
  const [amountText, setAmountText] = useState(editing ? String(editing.amount) : '')
  const [comment, setComment] = useState(editing?.comment ?? '')

  const labels = TYPE_LABELS[type]

  const handleSubmit = () => {
    const amount = Number(amountText.replace(',', '.'))
    onSave({
      type,
      date,
      participant_id: participantId,
      service_id: serviceId,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      comment: comment.trim() || null,
    })
  }

  const amountNum = Number(amountText.replace(',', '.')) || 0
  const canSave = amountNum > 0 && !!date

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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-date">Дата</Label>
              <Input
                id="trx-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trx-amount">Сумма, EUR</Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="trx-service">Статья (за что)</Label>
            <SearchableSelect
              id="trx-service"
              value={serviceId}
              onChange={setServiceId}
              options={catalog.map((s) => ({ value: s.id, label: s.name }))}
              placeholder="Не указана"
              noneLabel="— Не указана —"
              searchPlaceholder="Поиск услуги"
              emptyText="Услуг с таким именем нет"
            />
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
