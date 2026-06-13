'use client'

/**
 * Вкладка «Подбор ВНЖ» в проекте (Контур 2). Выбор страны + анкета-подбор.
 * Ответы и снимок результата сохраняются в case_profiles (по проекту).
 */

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useResidenceCountries, useResidenceCatalog } from '@/lib/residence/useResidenceCatalog'
import { MultiSelect } from '@/components/ui/multi-select'
import type { Answers } from '@/lib/residence/ruleEvaluator'
import { ResidenceMatcher } from '@/components/residence/ResidenceMatcher'
import { useCaseProfile, useSaveCaseProfile, type CaseProfile } from '@/hooks/useCaseProfile'
import { caseProfileKeys } from '@/hooks/queryKeys'

export function VisaSelectionTabContent({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const profileQ = useCaseProfile(projectId)
  if (profileQ.isLoading) return <Skeleton className="h-64 w-full" />
  return (
    <Inner
      key={profileQ.data?.id ?? 'new'}
      projectId={projectId}
      workspaceId={workspaceId}
      profile={profileQ.data ?? null}
    />
  )
}

function Inner({
  projectId, workspaceId, profile,
}: {
  projectId: string
  workspaceId: string
  profile: CaseProfile | null
}) {
  const countriesQ = useResidenceCountries()
  const [countryId, setCountryId] = useState<string | null>(profile?.country_id ?? null)
  const [answers, setAnswers] = useState<Answers>(profile?.answers ?? {})
  // null = все ВНЖ; иначе — рассматриваемые. Старт из сохранённого.
  const [visibleTypeIds, setVisibleTypeIds] = useState<string[] | null>(
    profile?.selected_residence_type_ids?.length ? profile.selected_residence_type_ids : null,
  )
  const [dirty, setDirty] = useState(false)

  const effectiveCountryId = useMemo(
    () => countryId ?? countriesQ.data?.[0]?.id ?? null,
    [countryId, countriesQ.data],
  )
  const catalogQ = useResidenceCatalog(effectiveCountryId)
  const save = useSaveCaseProfile(projectId, workspaceId)
  const qc = useQueryClient()

  const handleSave = async () => {
    // 1) сохраняем ответы; 2) официальный расчёт снимка на сервере (Edge)
    await save.mutateAsync({
      country_id: effectiveCountryId,
      answers,
      selected_residence_type_ids: visibleTypeIds ?? [],
    })
    try {
      await supabase.functions.invoke('residence-match', { body: { project_id: projectId } })
      qc.invalidateQueries({ queryKey: caseProfileKeys.byProject(projectId) })
    } catch {
      /* снимок не обновлён, но ответы сохранены */
    }
    setDirty(false)
  }

  if (countriesQ.isLoading) return <Skeleton className="h-64 w-full" />
  if (countriesQ.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 text-sm text-destructive">
          Ошибка доступа к базе ВНЖ: {(countriesQ.error as Error)?.message}
        </CardContent>
      </Card>
    )
  }
  const countries = countriesQ.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Страна:</span>
        <Select
          value={effectiveCountryId ?? undefined}
          onValueChange={(v) => { setCountryId(v); setDirty(true) }}
        >
          <SelectTrigger className="w-56"><SelectValue placeholder="Выберите страну" /></SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name_ru || c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {catalogQ.data && catalogQ.data.residenceTypes.length > 0 && (
          <MultiSelect
            className="w-80"
            placeholder="Все виды ВНЖ"
            showSearch
            showSelectAll
            maxVisibleTags={2}
            searchPlaceholder="Поиск ВНЖ…"
            options={catalogQ.data.residenceTypes.map((t) => ({ value: t.id, label: t.name_ru || t.name_en }))}
            value={visibleTypeIds ?? catalogQ.data.residenceTypes.map((t) => t.id)}
            onChange={(ids) => {
              const next = ids.length === catalogQ.data!.residenceTypes.length ? null : ids
              setVisibleTypeIds(next)
              setDirty(true)
              // авто-сохраняем выбор ВНЖ (часть профиля проекта) — переживёт обновление
              save.mutate({ country_id: effectiveCountryId, answers, selected_residence_type_ids: next ?? [] })
            }}
          />
        )}
        <div className="ml-auto flex items-center gap-2">
          {!dirty && profile && <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Check className="h-3 w-3" /> сохранено</span>}
          <Button size="sm" onClick={handleSave} disabled={save.isPending || !dirty}>
            {save.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </div>

      {effectiveCountryId && (
        <ResidenceMatcher
          countryId={effectiveCountryId}
          answers={answers}
          onAnswersChange={(a) => { setAnswers(a); setDirty(true) }}
          visibleTypeIds={visibleTypeIds ?? undefined}
        />
      )}
    </div>
  )
}
