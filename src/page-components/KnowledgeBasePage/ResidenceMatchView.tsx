'use client'

/**
 * Вкладка «Подбор» (Контур 1) — база знаний ВНЖ.
 * Выбор страны + матрица «критерии × виды ВНЖ». Выбор колонок ВНЖ запоминается
 * между сессиями (localStorage, по стране).
 */

import { useState, useMemo, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { MultiSelect } from '@/components/ui/multi-select'
import { useWorkspacePermissions } from '@/hooks/permissions/useWorkspacePermissions'
import { useResidenceCountries, useResidenceCatalog } from '@/lib/residence/useResidenceCatalog'
import type { ResidenceCriterion } from '@/lib/residence/types'
import { ResidenceMatrix } from './ResidenceMatrix'
import { CriterionDialog, ResidenceTypeDialog } from './ResidenceEditDialogs'

const STORAGE_PREFIX = 'residence-visible-vnj:'

function loadVisible(countryId: string): string[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + countryId)
    const arr = raw ? JSON.parse(raw) : null
    return Array.isArray(arr) ? arr : null
  } catch {
    return null
  }
}

function saveVisible(countryId: string, ids: string[] | null) {
  if (typeof window === 'undefined') return
  try {
    if (ids === null) window.localStorage.removeItem(STORAGE_PREFIX + countryId)
    else window.localStorage.setItem(STORAGE_PREFIX + countryId, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

export function ResidenceMatchView() {
  const countriesQ = useResidenceCountries()
  const [countryId, setCountryId] = useState<string | null>(null)
  const { isOwner } = useWorkspacePermissions()

  const effectiveCountryId = useMemo(
    () => countryId ?? countriesQ.data?.[0]?.id ?? null,
    [countryId, countriesQ.data],
  )

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

  const countrySelect = (
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
  )

  if (!effectiveCountryId) return null

  return (
    <ResidenceCountryView
      key={effectiveCountryId}
      countryId={effectiveCountryId}
      isOwner={isOwner}
      countrySelect={countrySelect}
    />
  )
}

function ResidenceCountryView({
  countryId,
  isOwner,
  countrySelect,
}: {
  countryId: string
  isOwner: boolean
  countrySelect: ReactNode
}) {
  const catalogQ = useResidenceCatalog(countryId)
  // null = все ВНЖ; иначе — выбранные. Стартовое — из localStorage (по стране).
  const [visibleTypeIds, setVisibleTypeIds] = useState<string[] | null>(() => loadVisible(countryId))
  const [criterionOpen, setCriterionOpen] = useState(false)
  const [editingCriterion, setEditingCriterion] = useState<ResidenceCriterion | null>(null)
  const [typeOpen, setTypeOpen] = useState(false)

  const cat = catalogQ.data

  const handleVisibleChange = (ids: string[], allLen: number) => {
    const next = ids.length === allLen ? null : ids
    setVisibleTypeIds(next)
    saveVisible(countryId, next)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Страна:</span>
        {countrySelect}
        {cat && cat.residenceTypes.length > 0 && (
          <MultiSelect
            className="w-96"
            placeholder="Все виды ВНЖ"
            showSearch
            showSelectAll
            maxVisibleTags={2}
            searchPlaceholder="Поиск ВНЖ…"
            options={cat.residenceTypes.map((t) => ({ value: t.id, label: t.name_ru || t.name_en }))}
            value={visibleTypeIds ?? cat.residenceTypes.map((t) => t.id)}
            onChange={(ids) => handleVisibleChange(ids, cat.residenceTypes.length)}
          />
        )}
        {isOwner && cat && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setCriterionOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Критерий
            </Button>
            <Button size="sm" variant="outline" onClick={() => setTypeOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> ВНЖ
            </Button>
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

      {cat && (
        <ResidenceMatrix
          catalog={cat}
          visibleTypeIds={visibleTypeIds ?? undefined}
          onEditCriterion={isOwner ? setEditingCriterion : undefined}
        />
      )}

      {cat && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{cat.residenceTypes.length} ВНЖ</Badge>
          <Badge variant="outline">{cat.criteria.length} критериев</Badge>
          <Badge variant="outline">{cat.groups.length} групп</Badge>
          <Badge variant="outline">{cat.rules.length} правил</Badge>
        </div>
      )}

      {cat && (criterionOpen || editingCriterion) && (
        <CriterionDialog
          key={editingCriterion?.id ?? 'new'}
          open
          onOpenChange={(v) => {
            if (!v) { setCriterionOpen(false); setEditingCriterion(null) }
          }}
          countryId={countryId}
          groups={cat.groups}
          criterion={editingCriterion}
        />
      )}

      <ResidenceTypeDialog open={typeOpen} onOpenChange={setTypeOpen} countryId={countryId} />
    </div>
  )
}
