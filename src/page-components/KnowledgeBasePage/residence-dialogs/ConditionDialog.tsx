'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useUpdateCondition } from '@/lib/residence/mutations'
import type { ResidenceCatalog, ResidenceCriterion, RuleCondition } from '@/lib/residence/types'
import type { MatrixCell } from '@/lib/residence/matrix'
import { useCurrentStatuses } from '@/lib/residence/useResidenceCatalog'
import { NUMBER_OPS, SeverityPicker } from './shared'

/** Правка условия (порога) критерия для конкретного ВНЖ. */
export function ConditionDialog({
  open, onOpenChange, countryId, catalog, criterion, residenceTypeId, residenceTypeName, cell,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
  catalog: ResidenceCatalog
  criterion: ResidenceCriterion
  residenceTypeId: string
  residenceTypeName: string
  cell: MatrixCell
}) {
  const ft = criterion.field_type
  const [operator, setOperator] = useState<RuleCondition['operator']>(cell?.operator ?? (ft === 'number' ? '>=' : '='))
  const [numValue, setNumValue] = useState<string>(
    cell && typeof cell.value === 'number' ? String(cell.value) : '',
  )
  const [boolValue, setBoolValue] = useState<boolean>(
    cell && typeof cell.value === 'boolean' ? cell.value : true,
  )
  const [textValue, setTextValue] = useState<string>(
    cell && typeof cell.value === 'string' ? cell.value : '',
  )
  const [severity, setSeverity] = useState<RuleCondition['severity']>(cell?.severity ?? 'important')
  const [err, setErr] = useState<string | null>(null)

  const update = useUpdateCondition(countryId, catalog)
  const isReference = ft === 'reference' || Array.isArray(cell?.value)
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(
    Array.isArray(cell?.value) ? (cell.value as string[]) : [],
  )
  const statusesQ = useCurrentStatuses(countryId)
  const statusOptions = (statusesQ.data ?? []).map((s) => ({ value: s.id, label: s.name_ru }))
  // только валидные id (присутствующие в справочнике) — отсекаем старые «висячие»
  const validSelected = selectedStatuses.filter((id) => statusOptions.some((o) => o.value === id))

  const handleSave = async () => {
    setErr(null)
    let value: RuleCondition['value']
    if (isReference) {
      if (validSelected.length === 0) { setErr('Выберите хотя бы один статус'); return }
      value = validSelected
    } else if (ft === 'number') {
      if (numValue.trim() === '' || Number.isNaN(Number(numValue))) { setErr('Введите число'); return }
      value = Number(numValue)
    } else if (ft === 'boolean') {
      value = boolValue
    } else {
      value = textValue.trim()
    }
    try {
      await update.mutateAsync({
        residenceTypeId,
        field: criterion.field_key,
        operator: ft === 'boolean' || isReference ? '=' : operator,
        value,
        severity,
      })
      onOpenChange(false)
    } catch (e) {
      setErr((e as Error)?.message ?? 'Ошибка сохранения')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle className="text-base">
            {criterion.title_ru || criterion.title_en}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">для ВНЖ «{residenceTypeName}»</p>
        </DialogHeader>

        {isReference ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Допустимые статусы</Label>
              {statusesQ.isLoading ? (
                <p className="text-sm text-muted-foreground">Загрузка…</p>
              ) : (
                <div className="rounded-md border">
                  <div className="flex items-center justify-between border-b px-2 py-1 text-xs">
                    <span className="text-muted-foreground">Выбрано: {validSelected.length}</span>
                    <div className="flex gap-2">
                      <button type="button" className="text-primary hover:underline"
                        onClick={() => setSelectedStatuses(statusOptions.map((o) => o.value))}>все</button>
                      <button type="button" className="text-muted-foreground hover:underline"
                        onClick={() => setSelectedStatuses([])}>снять</button>
                    </div>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-1">
                    {statusOptions.length === 0 ? (
                      <p className="px-2 py-2 text-sm text-muted-foreground">Нет статусов</p>
                    ) : (
                      statusOptions.map((o) => {
                        const checked = selectedStatuses.includes(o.value)
                        return (
                          <label key={o.value}
                            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                setSelectedStatuses((prev) =>
                                  prev.includes(o.value)
                                    ? prev.filter((x) => x !== o.value)
                                    : [...prev, o.value],
                                )
                              }
                            />
                            <span>{o.label}</span>
                          </label>
                        )
                      })
                    )}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Из каких текущих статусов клиента доступен этот ВНЖ.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Важность</Label>
              <SeverityPicker value={severity} onChange={setSeverity} />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {ft === 'number' && (
              <div className="flex gap-2">
                <div className="space-y-1.5 w-44">
                  <Label>Условие</Label>
                  <Select value={operator} onValueChange={(v) => setOperator(v as RuleCondition['operator'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {NUMBER_OPS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label>Значение</Label>
                  <Input type="number" value={numValue} onChange={(e) => setNumValue(e.target.value)} />
                </div>
              </div>
            )}

            {ft === 'boolean' && (
              <div className="space-y-1.5">
                <Label>Требуемый ответ</Label>
                <Select value={boolValue ? 'yes' : 'no'} onValueChange={(v) => setBoolValue(v === 'yes')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Да</SelectItem>
                    <SelectItem value="no">Нет</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {ft === 'text' && (
              <div className="space-y-1.5">
                <Label>Значение</Label>
                <Input value={textValue} onChange={(e) => setTextValue(e.target.value)} />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Важность</Label>
              <SeverityPicker value={severity} onChange={setSeverity} />
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Отмена
          </Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
