'use client'

/**
 * Вкладка «Подбор ВНЖ» в проекте (Контур 2). Выбор страны + анкета-подбор.
 * Ответы/результат пока не сохраняются (персист — следующая фаза).
 */

import { useMemo, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useResidenceCountries } from '@/lib/residence/useResidenceCatalog'
import { ResidenceMatcher } from '@/components/residence/ResidenceMatcher'

export function VisaSelectionTabContent({ projectId }: { projectId: string; workspaceId: string }) {
  const countriesQ = useResidenceCountries()
  const [countryId, setCountryId] = useState<string | null>(null)
  const effectiveCountryId = useMemo(
    () => countryId ?? countriesQ.data?.[0]?.id ?? null,
    [countryId, countriesQ.data],
  )

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
    <div className="space-y-4" data-project-id={projectId}>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Страна:</span>
        <Select value={effectiveCountryId ?? undefined} onValueChange={setCountryId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Выберите страну" /></SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name_ru || c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {effectiveCountryId && <ResidenceMatcher countryId={effectiveCountryId} />}
    </div>
  )
}
