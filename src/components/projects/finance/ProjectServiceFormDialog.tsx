/**
 * ProjectServiceFormDialog — добавление / редактирование услуги в проекте.
 * Услуга выбирается из справочника finance_services. Имя и цена —
 * snapshot, можно править под конкретный проект (на справочник не влияет).
 */

import { useState } from 'react'
import { Plus } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useFinanceServices,
  useCreateFinanceService,
  type FinanceService,
} from '@/hooks/useFinanceServices'
import { FinanceServiceFormDialog } from '@/components/directories/FinanceServiceFormDialog'
import type {
  ProjectService,
  ProjectServiceFormData,
} from '@/hooks/useProjectServices'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  editing: ProjectService | null
  onSave: (form: ProjectServiceFormData) => void
  saving: boolean
}

const formatTotal = (q: number, p: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    q * p,
  )

export function ProjectServiceFormDialog({
  open,
  onOpenChange,
  workspaceId,
  editing,
  onSave,
  saving,
}: Props) {
  const { data: catalog = [] } = useFinanceServices(workspaceId)
  const createCatalogItem = useCreateFinanceService(workspaceId)

  // Инициализация — компонент пересоздаётся снаружи через key={editing?.id ?? 'new'}.
  const [serviceId, setServiceId] = useState<string | null>(editing?.service_id ?? null)
  const [name, setName] = useState(editing?.name ?? '')
  const [quantityText, setQuantityText] = useState(
    editing ? String(editing.quantity) : '1',
  )
  const [priceText, setPriceText] = useState(
    editing ? String(editing.price) : '0',
  )

  const [createCatalogOpen, setCreateCatalogOpen] = useState(false)

  const handleSelectService = (id: string) => {
    setServiceId(id)
    const fromCatalog = catalog.find((s) => s.id === id)
    if (fromCatalog) {
      // При выборе услуги из справочника подменяем имя и цену на snapshot.
      // Если пользователь уже что-то ввёл руками — перезаписываем (так проще
      // и предсказуемо: «выбрал из списка → подтянулось»).
      setName(fromCatalog.name)
      setPriceText(String(fromCatalog.base_price))
    }
  }

  const handleCreateCatalog = (form: { name: string; base_price: number }) => {
    createCatalogItem.mutate(form, {
      onSuccess: (created) => {
        setCreateCatalogOpen(false)
        // Сразу подставляем созданную услугу в форму.
        setServiceId(created.id)
        setName(created.name)
        setPriceText(String(created.base_price))
      },
    })
  }

  const handleSubmit = () => {
    const q = Number(quantityText.replace(',', '.'))
    const p = Number(priceText.replace(',', '.'))
    onSave({
      service_id: serviceId,
      name,
      quantity: Number.isFinite(q) && q > 0 ? q : 1,
      price: Number.isFinite(p) && p >= 0 ? p : 0,
    })
  }

  const quantityNum = Number(quantityText.replace(',', '.')) || 0
  const priceNum = Number(priceText.replace(',', '.')) || 0
  const canSave = name.trim().length > 0 && quantityNum > 0

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Редактировать услугу' : 'Добавить услугу'}</DialogTitle>
            <DialogDescription>
              Услуга в этом проекте. Имя и цена — snapshot, изменения в справочнике её не
              перезаписывают.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-service-select">Услуга из справочника</Label>
              <div className="flex items-center gap-2">
                <Select value={serviceId ?? ''} onValueChange={handleSelectService}>
                  <SelectTrigger id="proj-service-select" className="flex-1">
                    <SelectValue placeholder="Выбери услугу" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalog.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-gray-500">Справочник пуст</div>
                    ) : (
                      catalog.map((s: FinanceService) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCreateCatalogOpen(true)}
                  aria-label="Создать новую услугу в справочнике"
                  title="Создать новую услугу в справочнике"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Не нашёл подходящую — нажми «+» и создай прямо отсюда.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proj-service-name">Название в проекте</Label>
              <Input
                id="proj-service-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Консультация"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="proj-service-qty">Кол-во</Label>
                <Input
                  id="proj-service-qty"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={quantityText}
                  onChange={(e) => setQuantityText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="proj-service-price">Цена, EUR</Label>
                <Input
                  id="proj-service-price"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={priceText}
                  onChange={(e) => setPriceText(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Сумма, EUR</Label>
                <div className="h-10 flex items-center px-3 rounded-md border bg-gray-50 text-sm tabular-nums">
                  {formatTotal(quantityNum, priceNum)}
                </div>
              </div>
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

      <FinanceServiceFormDialog
        key={createCatalogOpen ? 'create-catalog' : 'create-catalog-closed'}
        open={createCatalogOpen}
        onOpenChange={setCreateCatalogOpen}
        editing={null}
        onSave={handleCreateCatalog}
        saving={createCatalogItem.isPending}
      />
    </>
  )
}
