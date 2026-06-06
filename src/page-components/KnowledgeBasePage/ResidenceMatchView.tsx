'use client'

/**
 * ВРЕМЕННАЯ вкладка «Подбор» (Шаг 1) — проверка чтения внешней базы ВНЖ.
 * Показывает сырьё: список стран + по выбранной стране счётчики и списки
 * (виды ВНЖ, группы, критерии, правила). На следующем шаге заменится матрицей.
 */

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useResidenceCountries, useResidenceCatalog } from '@/lib/residence/useResidenceCatalog'

export function ResidenceMatchView() {
  const countriesQ = useResidenceCountries()
  const [countryId, setCountryId] = useState<string | null>(null)

  const effectiveCountryId = useMemo(
    () => countryId ?? countriesQ.data?.[0]?.id ?? null,
    [countryId, countriesQ.data],
  )
  const catalogQ = useResidenceCatalog(effectiveCountryId)

  if (countriesQ.isLoading) {
    return <Skeleton className="h-40 w-full" />
  }

  if (countriesQ.isError) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6 text-sm text-destructive">
          Ошибка доступа к внешней базе ВНЖ: {(countriesQ.error as Error)?.message}
        </CardContent>
      </Card>
    )
  }

  const countries = countriesQ.data ?? []
  if (countries.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          Подключение есть, но список стран пуст. Проверь данные в базе mod_choice.
        </CardContent>
      </Card>
    )
  }

  const cat = catalogQ.data

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Страна:</span>
        <Select value={effectiveCountryId ?? undefined} onValueChange={setCountryId}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Выберите страну" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name_ru || c.name_en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline">проверка чтения (Шаг 1)</Badge>
      </div>

      {catalogQ.isLoading && <Skeleton className="h-40 w-full" />}

      {catalogQ.isError && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">
            Ошибка загрузки справочника: {(catalogQ.error as Error)?.message}
          </CardContent>
        </Card>
      )}

      {cat && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <CountCard label="Виды ВНЖ" value={cat.residenceTypes.length} />
            <CountCard label="Группы критериев" value={cat.groups.length} />
            <CountCard label="Критерии" value={cat.criteria.length} />
            <CountCard label="Правила" value={cat.rules.length} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Виды ВНЖ</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {cat.residenceTypes.length === 0
                ? <span className="text-sm text-muted-foreground">нет</span>
                : cat.residenceTypes.map((t) => (
                    <Badge key={t.id} variant="secondary">{t.name_ru || t.name_en}</Badge>
                  ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Критерии (по группам)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {cat.groups.map((g) => {
                const items = cat.criteria.filter((c) => c.group_id === g.id)
                return (
                  <div key={g.id}>
                    <div className="text-sm font-medium mb-1">📁 {g.name_ru || g.name_en}</div>
                    <div className="flex flex-wrap gap-2 pl-4">
                      {items.length === 0
                        ? <span className="text-xs text-muted-foreground">пусто</span>
                        : items.map((c) => (
                            <Badge key={c.id} variant="outline" className="font-normal">
                              {c.title_ru || c.title_en}
                              <span className="ml-1 text-muted-foreground">· {c.field_type}</span>
                            </Badge>
                          ))}
                    </div>
                  </div>
                )
              })}
              {(() => {
                const ungrouped = cat.criteria.filter(
                  (c) => !c.group_id || !cat.groups.some((g) => g.id === c.group_id),
                )
                if (ungrouped.length === 0) return null
                return (
                  <div>
                    <div className="text-sm font-medium mb-1 text-muted-foreground">без группы</div>
                    <div className="flex flex-wrap gap-2 pl-4">
                      {ungrouped.map((c) => (
                        <Badge key={c.id} variant="outline" className="font-normal">
                          {c.title_ru || c.title_en}
                          <span className="ml-1 text-muted-foreground">· {c.field_type}</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}
