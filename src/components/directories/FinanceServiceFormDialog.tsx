/**
 * FinanceServiceFormDialog — создание / редактирование услуги в справочнике.
 */

import { useState } from 'react'
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
import type { FinanceService, FinanceServiceFormData } from '@/hooks/useFinanceServices'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: FinanceService | null
  onSave: (form: FinanceServiceFormData) => void
  saving: boolean
}

export function FinanceServiceFormDialog({ open, onOpenChange, editing, onSave, saving }: Props) {
  // Инициализация из editing — компонент пересоздаётся снаружи через
  // key={editing?.id ?? 'new'}, поэтому начальное значение всегда свежее.
  const [name, setName] = useState(editing?.name ?? '')
  const [priceText, setPriceText] = useState(editing ? String(editing.base_price) : '0')

  const handleSubmit = () => {
    const parsed = Number(priceText.replace(',', '.'))
    const base_price = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    onSave({ name, base_price })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Редактировать услугу' : 'Новая услуга'}</DialogTitle>
          <DialogDescription>
            Услуга появится в выборе при добавлении в проект и в доходах/расходах.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="finance-service-name">Название</Label>
            <Input
              id="finance-service-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Консультация"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="finance-service-price">Базовая цена, EUR</Label>
            <Input
              id="finance-service-price"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              0 — индивидуальная цена для каждого проекта.
            </p>
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
