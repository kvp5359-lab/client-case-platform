'use client'

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useAddCondition } from '@/lib/residence/mutations'
import type { ResidenceCatalog, RuleCondition } from '@/lib/residence/types'
import { buildResidenceMatrix } from '@/lib/residence/matrix'
import { NUMBER_OPS, SeverityPicker } from './shared'

/** Добавить новое условие (критерий из группы + значение) для ВНЖ. */
export function AddConditionDialog({
  open, onOpenChange, countryId, catalog, groupId, residenceTypeId, residenceTypeName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
  catalog: ResidenceCatalog
  groupId: string | null
  residenceTypeId: string
  residenceTypeName: string
}) {
  // критерии группы, которых у этого ВНЖ ещё нет
  const cells = buildResidenceMatrix(catalog).cells
  const available = catalog.criteria.filter(
    (c) =>
      (c.group_id ?? null) === groupId &&
      !cells.get(c.field_key)?.has(residenceTypeId),
  )

  const [critId, setCritId] = useState<string>('')
  const [operator, setOperator] = useState<RuleCondition['operator']>('>=')
  const [numValue, setNumValue] = useState('')
  const [boolValue, setBoolValue] = useState(true)
  const [textValue, setTextValue] = useState('')
  const [severity, setSeverity] = useState<RuleCondition['severity']>('important')
  const [err, setErr] = useState<string | null>(null)

  const add = useAddCondition(countryId, catalog)
  const crit = available.find((c) => c.id === critId)
  const ft = crit?.field_type
  const isReference = ft === 'reference'

  const handleSave = async () => {
    setErr(null)
    if (!crit) { setErr('Выберите критерий'); return }
    if (isReference) { setErr('Критерий-список пока нельзя добавить из таблицы'); return }
    let value: RuleCondition['value']
    if (ft === 'number') {
      if (numValue.trim() === '' || Number.isNaN(Number(numValue))) { setErr('Введите число'); return }
      value = Number(numValue)
    } else if (ft === 'boolean') {
      value = boolValue
    } else {
      value = textValue.trim()
    }
    try {
      await add.mutateAsync({
        residenceTypeId,
        field: crit.field_key,
        operator: ft === 'boolean' ? '=' : operator,
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
          <DialogTitle className="text-base">Добавить условие</DialogTitle>
          <p className="text-xs text-muted-foreground">для ВНЖ «{residenceTypeName}»</p>
        </DialogHeader>

        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Все критерии этой группы уже добавлены к ВНЖ.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Критерий</Label>
              <Select value={critId} onValueChange={setCritId}>
                <SelectTrigger><SelectValue placeholder="Выберите критерий" /></SelectTrigger>
                <SelectContent>
                  {available.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title_ru || c.title_en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {crit && !isReference && (
              <>
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
              </>
            )}

            {crit && isReference && (
              <p className="text-sm text-muted-foreground">
                Критерий-список (напр. «текущий статус») пока нельзя добавить из таблицы.
              </p>
            )}

            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={add.isPending}>Отмена</Button>
          {available.length > 0 && (
            <Button onClick={handleSave} disabled={add.isPending || !crit || isReference}>
              {add.isPending ? 'Сохранение…' : 'Добавить'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
