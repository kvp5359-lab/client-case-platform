'use client'

/**
 * Вкладка «Подбор» (Контур 1) — база знаний ВНЖ.
 * Выбор страны + матрица «критерии × виды ВНЖ» (read-only обзор).
 */

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useResidenceCountries, useResidenceCatalog } from '@/lib/residence/useResidenceCatalog'
import { ResidenceMatrix } from './ResidenceMatrix'

export function ResidenceMatchView() {
  const countriesQ = useResidenceCountries()
  const [countryId, setCountryId] = useState<string | null>(null)

  const effectiveCountryId = useMemo(
    () => countryId ?? countriesQ.data?.[0]?.id ?? null,
    [countryId, countriesQ.data],
  )
  const catalogQ = useResidenceCatalog(effectiveCountryId)

  if (countriesQ.isLoading) return <Skeleton className="h-40 w-full" />

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
  if (countries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Подключение есть, но список стран пуст.
        </CardContent>
      </Card>
    )
  }

  const cat = catalogQ.data

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Страна:</span>
        <Select value={effectiveCountryId ?? undefined} onValueChange={setCountryId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Выберите страну" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name_ru || c.name_en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {cat && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{cat.residenceTypes.length} ВНЖ</Badge>
            <Badge variant="outline">{cat.criteria.length} критериев</Badge>
            <Badge variant="outline">{cat.groups.length} групп</Badge>
            <Badge variant="outline">{cat.rules.length} правил</Badge>
          </div>
        )}
      </div>

      {catalogQ.isLoading && <Skeleton className="h-64 w-full" />}

      {catalogQ.isError && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            Ошибка загрузки справочника: {(catalogQ.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      {cat && <ResidenceMatrix catalog={cat} />}
    </div>
  )
}
