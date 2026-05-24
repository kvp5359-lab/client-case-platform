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
import { SearchableSelect } from '@/components/ui/searchable-select'
import {
  useFinanceServices,
  useCreateFinanceService,
} from '@/hooks/finance/useFinanceServices'
import { useFinanceTaxRates } from '@/hooks/finance/useFinanceTaxRates'
import { FinanceServiceFormDialog } from '@/components/directories/FinanceServiceFormDialog'
import type {
  ProjectService,
  ProjectServiceFormData,
} from '@/hooks/projects/useProjectServices'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  editing: ProjectService | null
  onSave: (form: ProjectServiceFormData) => void
  saving: boolean
}

const fmt = (value: number): string =>
  new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    value,
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
  const { data: taxRates = [] } = useFinanceTaxRates(workspaceId)
  const createCatalogItem = useCreateFinanceService(workspaceId)

  // При создании новой позиции — автоподставляем дефолтный налог из справочника.
  const defaultTax = taxRates.find((t) => t.is_default)

  // Инициализация — компонент пересоздаётся снаружи через key={editing?.id ?? 'new'}.
  const [serviceId, setServiceId] = useState<string | null>(editing?.service_id ?? null)
  const [name, setName] = useState(editing?.name ?? '')
  const [quantityText, setQuantityText] = useState(
    editing ? String(editing.quantity) : '1',
  )
  const [priceText, setPriceText] = useState(
    editing ? String(editing.price) : '0',
  )
  const [taxRateId, setTaxRateId] = useState<string | null>(
    editing ? editing.tax_rate_id : (defaultTax?.id ?? null),
  )

  const [createCatalogOpen, setCreateCatalogOpen] = useState(false)

  const handleSelectService = (id: string | null) => {
    setServiceId(id)
    if (!id) return
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

  const selectedTax = taxRates.find((t) => t.id === taxRateId)

  const handleSubmit = () => {
    const q = Number(quantityText.replace(',', '.'))
    const p = Number(priceText.replace(',', '.'))
    onSave({
      service_id: serviceId,
      name,
      quantity: Number.isFinite(q) && q > 0 ? q : 1,
      price: Number.isFinite(p) && p >= 0 ? p : 0,
      tax_rate_id: taxRateId,
      // Snapshot процента — чтобы изменения справочника не пересчитывали историю.
      tax_rate: selectedTax ? Number(selectedTax.rate) : null,
    })
  }

  const quantityNum = Number(quantityText.replace(',', '.')) || 0
  const priceNum = Number(priceText.replace(',', '.')) || 0
  const subtotalNum = quantityNum * priceNum
  const taxNum = selectedTax ? subtotalNum * (Number(selectedTax.rate) / 100) : 0
  const totalNum = subtotalNum + taxNum
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
                <div className="flex-1">
                  <SearchableSelect
                    id="proj-service-select"
                    value={serviceId}
                    onChange={handleSelectService}
                    options={catalog.map((s) => ({
                      value: s.id,
                      label: s.name,
                      hint: Number(s.base_price) > 0 ? `${s.base_price} EUR` : undefined,
                    }))}
                    placeholder="Выбери услугу"
                    noneLabel={null}
                    searchPlaceholder="Поиск по названию"
                    emptyText={catalog.length === 0 ? 'Справочник пуст' : 'Ничего не нашли'}
                  />
                </div>
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

            <div className="grid grid-cols-2 gap-3">
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
                <Label htmlFor="proj-service-price">Цена, EUR (без налога)</Label>
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="proj-service-tax">Налог</Label>
              <SearchableSelect
                id="proj-service-tax"
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
                  taxRates.length === 0
                    ? 'Справочник налогов пуст'
                    : 'Ничего не нашли'
                }
              />
            </div>

            <div className="rounded-md border bg-gray-50 p-3 space-y-1 text-sm tabular-nums">
              <div className="flex justify-between text-gray-600">
                <span>Без налога</span>
                <span>{fmt(subtotalNum)} EUR</span>
              </div>
              {selectedTax && (
                <div className="flex justify-between text-gray-600">
                  <span>{selectedTax.name} ({Number(selectedTax.rate)}%)</span>
                  <span>+{fmt(taxNum)} EUR</span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-1 border-t">
                <span>Итого</span>
                <span>{fmt(totalNum)} EUR</span>
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
