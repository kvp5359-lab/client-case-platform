'use client'

/**
 * Диалоги создания критерия и вида ВНЖ (Контур 1, Шаг 3).
 * Гейт (показ кнопок) — на стороне вызывающего по isOwner.
 */

import { useState } from 'react'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  useCreateCriterion, useUpdateCriterion, useCreateGroup, useCreateResidenceType,
  useUpdateCondition, useAddCondition,
} from '@/lib/residence/mutations'
import type {
  FieldType, ResidenceCriteriaGroup, ResidenceCriterion, ResidenceCatalog, RuleCondition,
} from '@/lib/residence/types'
import { buildResidenceMatrix, type MatrixCell } from '@/lib/residence/matrix'

const FIELD_TYPE_LABELS: { value: FieldType; label: string }[] = [
  { value: 'number', label: 'Число' },
  { value: 'boolean', label: 'Да / нет' },
  { value: 'text', label: 'Текст' },
  { value: 'reference', label: 'Выбор из списка' },
]

export function CriterionDialog({
  open, onOpenChange, countryId, groups, criterion,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
  groups: ResidenceCriteriaGroup[]
  /** Если задан — режим редактирования (иначе создание). */
  criterion?: ResidenceCriterion | null
}) {
  // Начальные значения берём из criterion (режим правки) или дефолты (создание).
  // Сброс/префилл обеспечивается перемонтажом по `key` в родителе.
  const isEdit = !!criterion
  const [title, setTitle] = useState(criterion?.title_ru ?? '')
  const [isAskable, setIsAskable] = useState(criterion?.is_askable ?? true)
  const [question, setQuestion] = useState(criterion?.question_ru ?? '')
  const [fieldType, setFieldType] = useState<FieldType>(criterion?.field_type ?? 'boolean')
  const [groupId, setGroupId] = useState<string>(criterion?.group_id ?? '__none__')
  const [newGroup, setNewGroup] = useState('')
  const [optionsText, setOptionsText] = useState((criterion?.options ?? []).join('\n'))
  const [isRequired, setIsRequired] = useState(criterion?.is_required ?? false)
  const [err, setErr] = useState<string | null>(null)

  const createCriterion = useCreateCriterion(countryId)
  const updateCriterion = useUpdateCriterion(countryId)
  const createGroup = useCreateGroup(countryId)
  const busy = createCriterion.isPending || updateCriterion.isPending || createGroup.isPending

  const handleSave = async () => {
    setErr(null)
    if (!title.trim()) { setErr('Укажите название критерия'); return }
    try {
      let resolvedGroupId: string | null =
        groupId === '__none__' ? null : groupId === '__new__' ? null : groupId
      if (groupId === '__new__') {
        if (!newGroup.trim()) { setErr('Укажите название новой группы'); return }
        resolvedGroupId = await createGroup.mutateAsync(newGroup.trim())
      }
      const options =
        fieldType === 'reference'
          ? optionsText.split('\n').map((s) => s.trim()).filter(Boolean)
          : null
      const payload = {
        title_ru: title.trim(),
        field_type: fieldType,
        group_id: resolvedGroupId,
        options: options && options.length ? options : null,
        is_required: isRequired,
        is_askable: isAskable,
        question_ru: isAskable ? (question.trim() || title.trim()) : null,
      }
      if (criterion) {
        await updateCriterion.mutateAsync({ ...payload, id: criterion.id })
      } else {
        await createCriterion.mutateAsync(payload)
      }
      onOpenChange(false)
    } catch (e) {
      setErr((e as Error)?.message ?? 'Ошибка сохранения')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Редактировать критерий' : 'Новый критерий'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Короткое название, напр. Доход" />
            <p className="text-[11px] text-muted-foreground">Для матрицы и внутреннего обзора.</p>
          </div>
          <div className="rounded-md border p-3 space-y-2.5">
            <div className="flex items-center gap-2">
              <Switch checked={isAskable} onCheckedChange={setIsAskable} id="askable" />
              <Label htmlFor="askable" className="cursor-pointer">Анкетируемый (задаётся клиенту вопросом)</Label>
            </div>
            {isAskable && (
              <div className="space-y-1.5">
                <Label>Текст вопроса</Label>
                <Textarea value={question} onChange={(e) => setQuestion(e.target.value)}
                  rows={2} placeholder="Напр. Ваш годовой доход (€)?" />
                <p className="text-[11px] text-muted-foreground">
                  Пусто → подставится название. Не анкетируемый → критерий участвует в правилах,
                  но клиента о нём не спрашивают.
                </p>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Группа</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Без группы</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name_ru || g.name_en}</SelectItem>
                ))}
                <SelectItem value="__new__">➕ Новая группа…</SelectItem>
              </SelectContent>
            </Select>
            {groupId === '__new__' && (
              <Input className="mt-1.5" value={newGroup} onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Название новой группы" />
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Тип ответа</Label>
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as FieldType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_LABELS.map((ft) => (
                  <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldType === 'reference' && (
            <div className="space-y-1.5">
              <Label>Варианты (по одному на строку)</Label>
              <Textarea value={optionsText} onChange={(e) => setOptionsText(e.target.value)}
                rows={4} placeholder={'Вариант 1\nВариант 2'} />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={isRequired} onCheckedChange={setIsRequired} id="req" />
            <Label htmlFor="req" className="cursor-pointer">Обязательный</Label>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Отмена</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? 'Сохранение…' : isEdit ? 'Сохранить' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const NUMBER_OPS: { value: RuleCondition['operator']; label: string }[] = [
  { value: '>=', label: '≥ не меньше' },
  { value: '<=', label: '≤ не больше' },
  { value: '>', label: '> больше' },
  { value: '<', label: '< меньше' },
  { value: '=', label: '= равно' },
]

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

  const handleSave = async () => {
    setErr(null)
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
      await update.mutateAsync({
        residenceTypeId,
        field: criterion.field_key,
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {criterion.title_ru || criterion.title_en}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">для ВНЖ «{residenceTypeName}»</p>
        </DialogHeader>

        {isReference ? (
          <p className="text-sm text-muted-foreground">
            Это критерий-список (напр. «текущий статус»). Правка набора значений пока недоступна —
            поддержим отдельно.
          </p>
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
              <Select value={severity ?? 'important'} onValueChange={(v) => setSeverity(v as RuleCondition['severity'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Критично (не подходит, если не выполнено)</SelectItem>
                  <SelectItem value="important">Желательно (частично подходит)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {err && <p className="text-sm text-destructive">{err}</p>}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Отмена
          </Button>
          {!isReference && (
            <Button onClick={handleSave} disabled={update.isPending}>
              {update.isPending ? 'Сохранение…' : 'Сохранить'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

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
      <DialogContent className="max-w-md">
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
                  <Select value={severity ?? 'important'} onValueChange={(v) => setSeverity(v as RuleCondition['severity'])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Критично</SelectItem>
                      <SelectItem value="important">Желательно</SelectItem>
                    </SelectContent>
                  </Select>
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

export function ResidenceTypeDialog({
  open, onOpenChange, countryId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  countryId: string
}) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'temporary' | 'permanent' | 'citizenship'>('temporary')
  const [description, setDescription] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const create = useCreateResidenceType(countryId)

  const handleSave = async () => {
    setErr(null)
    if (!name.trim()) { setErr('Укажите название ВНЖ'); return }
    try {
      await create.mutateAsync({ name_ru: name.trim(), category, description_ru: description.trim() })
      setName(''); setDescription(''); setCategory('temporary'); setErr(null)
      onOpenChange(false)
    } catch (e) {
      setErr((e as Error)?.message ?? 'Ошибка сохранения')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Новый вид ВНЖ</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Напр. Цифровой кочевник" />
          </div>
          <div className="space-y-1.5">
            <Label>Категория</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="temporary">Временный ВНЖ</SelectItem>
                <SelectItem value="permanent">ПМЖ</SelectItem>
                <SelectItem value="citizenship">Гражданство</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Описание</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Отмена</Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? 'Сохранение…' : 'Создать'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
