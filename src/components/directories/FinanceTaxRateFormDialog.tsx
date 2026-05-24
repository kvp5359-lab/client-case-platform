/**
 * FinanceTaxRateFormDialog — создание/редактирование ставки налога.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { FinanceTaxRate, FinanceTaxRateFormData } from '@/hooks/finance/useFinanceTaxRates'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FinanceTaxRate | null
  onSave: (form: FinanceTaxRateFormData) => void
  saving: boolean
}

export function FinanceTaxRateFormDialog({ open, onOpenChange, editing, onSave, saving }: Props) {
  const [name, setName] = useState(editing?.name ?? '')
  const [rateText, setRateText] = useState(editing ? String(editing.rate) : '')
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false)

  const handleSubmit = () => {
    const parsed = Number(rateText.replace(',', '.'))
    const rate = Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0
    onSave({ name, rate, is_default: isDefault })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Редактировать ставку' : 'Новая ставка налога'}</DialogTitle>
          <DialogDescription>
            Налог накручивается сверху. Например, «НДС 21%» — клиент платит 100 + 21.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tax-name">Название</Label>
            <Input
              id="tax-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="НДС 21%"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tax-rate">Ставка, %</Label>
            <Input
              id="tax-rate"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              value={rateText}
              onChange={(e) => setRateText(e.target.value)}
              placeholder="21"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="tax-default"
              checked={isDefault}
              onCheckedChange={(v) => setIsDefault(v === true)}
            />
            <Label htmlFor="tax-default" className="cursor-pointer text-sm font-normal">
              Использовать по умолчанию для новых услуг
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Отмена
          </Button>
          <Button onClick={handleSubmit} disabled={saving || !name.trim()}>
            {saving ? 'Сохранение…' : editing ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
