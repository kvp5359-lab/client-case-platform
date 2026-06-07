'use client'

/**
 * Вкладка «Подбор ВНЖ» в проекте (Контур 2). Выбор страны + анкета-подбор.
 * Ответы и снимок результата сохраняются в case_profiles (по проекту).
 */

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useResidenceCountries, useResidenceCatalog } from '@/lib/residence/useResidenceCatalog'
import { evaluateResidenceTypes, type Answers } from '@/lib/residence/ruleEvaluator'
import { ResidenceMatcher } from '@/components/residence/ResidenceMatcher'
import { useCaseProfile, useSaveCaseProfile, type CaseProfile } from '@/hooks/useCaseProfile'

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
  const [dirty, setDirty] = useState(false)

  const effectiveCountryId = useMemo(
    () => countryId ?? countriesQ.data?.[0]?.id ?? null,
    [countryId, countriesQ.data],
  )
  const catalogQ = useResidenceCatalog(effectiveCountryId)
  const save = useSaveCaseProfile(projectId, workspaceId)

  const handleSave = async () => {
    const result = catalogQ.data ? evaluateResidenceTypes(catalogQ.data, answers) : null
    await save.mutateAsync({ country_id: effectiveCountryId, answers, result_snapshot: result })
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
        />
      )}
    </div>
  )
}
