'use client'

/**
 * Подбор ВНЖ (Контур 2) — анкета + результат. Переиспользуется на вкладке «Подбор»
 * (демо) и в проекте. Считает на фронте движком ruleEvaluator (live-превью).
 */

import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useResidenceCatalog, useCurrentStatuses } from '@/lib/residence/useResidenceCatalog'
import { buildResidenceMatrix } from '@/lib/residence/matrix'
import { evaluateResidenceTypes, type Answers, type EvalStatus } from '@/lib/residence/ruleEvaluator'
import type { ResidenceCriterion } from '@/lib/residence/types'

export function ResidenceMatcher({
  countryId,
  answers,
  onAnswersChange,
  visibleTypeIds,
}: {
  countryId: string
  /** Контролируемые ответы (для персиста). Если не задано — внутренний стейт. */
  answers?: Answers
  onAnswersChange?: (a: Answers) => void
  /** Если задан — вопросы и результат сужаются до этих ВНЖ. */
  visibleTypeIds?: string[]
}) {
  const catalogQ = useResidenceCatalog(countryId)
  const statusesQ = useCurrentStatuses(countryId)
  const [internal, setInternal] = useState<Answers>({})
  const a = answers ?? internal
  const setAnswers = (next: Answers) => {
    if (onAnswersChange) onAnswersChange(next)
    else setInternal(next)
  }
  const setAnswer = (field: string, value: Answers[string]) => setAnswers({ ...a, [field]: value })

  const cat = catalogQ.data
  // анкетируемые критерии; при фильтре по ВНЖ — только используемые в выбранных
  const askable = useMemo(() => {
    const all = (cat?.criteria ?? []).filter((c) => c.is_askable)
    if (!cat || !visibleTypeIds || visibleTypeIds.length === 0) return all
    const cells = buildResidenceMatrix(cat).cells
    return all.filter((c) => visibleTypeIds.some((rtId) => cells.get(c.field_key)?.has(rtId)))
  }, [cat, visibleTypeIds])
  // группы с анкетируемыми критериями
  const groups = useMemo(() => {
    if (!cat) return []
    const out = cat.groups
      .map((g) => ({ group: g, items: askable.filter((c) => c.group_id === g.id) }))
      .filter((x) => x.items.length > 0)
    const nogroup = askable.filter((c) => !c.group_id || !cat.groups.some((g) => g.id === c.group_id))
    if (nogroup.length) out.push({ group: { id: '__none__', name_ru: 'Прочее', name_en: 'Прочее', display_order: 999, country_id: null, is_active: true }, items: nogroup })
    return out
  }, [cat, askable])

  const result = useMemo(
    () => (cat ? evaluateResidenceTypes(cat, a, visibleTypeIds && visibleTypeIds.length ? visibleTypeIds : undefined) : []),
    [cat, a, visibleTypeIds],
  )

  if (catalogQ.isLoading) return <Skeleton className="h-64 w-full" />
  if (!cat) return <p className="text-sm text-muted-foreground">Нет данных по стране.</p>

  const typeName = (id: string) =>
    cat.residenceTypes.find((t) => t.id === id)?.name_ru ?? '—'
  const byStatus = (s: EvalStatus) => result.filter((r) => r.status === s)
  const answered = Object.values(a).filter((v) => v !== undefined && v !== '').length

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Анкета */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Анкета</h3>
          <span className="text-xs text-muted-foreground">отвечено: {answered} / {askable.length}</span>
        </div>
        {groups.map(({ group, items }) => (
          <div key={group.id} className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {group.name_ru || group.name_en}
            </div>
            {items.map((crit) => (
              <QuestionField
                key={crit.id}
                crit={crit}
                value={a[crit.field_key]}
                statusOptions={(statusesQ.data ?? []).map((s) => ({ value: s.id, label: s.name_ru }))}
                onChange={(v) => setAnswer(crit.field_key, v)}
              />
            ))}
          </div>
        ))}
        {askable.length === 0 && (
          <p className="text-sm text-muted-foreground">Нет анкетируемых критериев.</p>
        )}
      </div>

      {/* Результат */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold">Подходящие ВНЖ</h3>
        <ResultGroup title="✅ Подходит" color="green" items={byStatus('eligible')} typeName={typeName} />
        <ResultGroup title="🟡 Частично" color="amber" items={byStatus('warning')} typeName={typeName} />
        <ResultGroup title="⬜ Не подходит" color="muted" items={byStatus('ineligible')} typeName={typeName} />
      </div>
    </div>
  )
}

function QuestionField({
  crit, value, statusOptions, onChange,
}: {
  crit: ResidenceCriterion
  value: Answers[string]
  statusOptions: { value: string; label: string }[]
  onChange: (v: Answers[string]) => void
}) {
  const label = crit.question_ru || crit.title_ru || crit.title_en
  return (
    <div className="space-y-1.5">
      <Label className="font-normal">{label}</Label>
      {crit.field_type === 'boolean' && (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={value === true ? 'default' : 'outline'}
            onClick={() => onChange(true)}>Да</Button>
          <Button type="button" size="sm" variant={value === false ? 'default' : 'outline'}
            onClick={() => onChange(false)}>Нет</Button>
        </div>
      )}
      {crit.field_type === 'number' && (
        <Input type="number" value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />
      )}
      {crit.field_type === 'text' && (
        <Input value={value === undefined ? '' : String(value)}
          onChange={(e) => onChange(e.target.value || undefined)} />
      )}
      {crit.field_type === 'reference' && (
        <Select value={value ? String(value) : undefined} onValueChange={(v) => onChange(v)}>
          <SelectTrigger><SelectValue placeholder="Выберите…" /></SelectTrigger>
          <SelectContent>
            {statusOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function ResultGroup({
  title, color, items, typeName,
}: {
  title: string
  color: 'green' | 'amber' | 'muted'
  items: { residenceTypeId: string; score: number; failedCritical: string[]; warnings: string[] }[]
  typeName: (id: string) => string
}) {
  if (items.length === 0) return null
  const border =
    color === 'green' ? 'border-l-green-500' : color === 'amber' ? 'border-l-amber-500' : 'border-l-muted'
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">{title} ({items.length})</div>
      {items.map((r) => (
        <Card key={r.residenceTypeId} className={cn('border-l-4', border)}>
          <CardContent className="flex items-center justify-between gap-2 py-2">
            <span className="text-sm">{typeName(r.residenceTypeId)}</span>
            <Badge variant="outline" className="shrink-0 text-[10px]">{r.score}%</Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
