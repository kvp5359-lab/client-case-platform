'use client'

import { useQuery } from '@tanstack/react-query'
import { getResidenceModuleClient } from './moduleClient'
import type {
  ResidenceCountry,
  ResidenceCatalog,
  ResidenceLink,
  ResidenceRule,
} from './types'

const SCHEMA = 'mod_choice'

/** Список стран из внешней базы ВНЖ. */
export function useResidenceCountries() {
  return useQuery({
    queryKey: ['residence', 'countries'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResidenceCountry[]> => {
      const sb = getResidenceModuleClient()
      const { data, error } = await sb
        .schema(SCHEMA)
        .from('countries')
        .select('*')
        .eq('is_active', true)
        .order('name_ru')
      if (error) throw error
      return (data ?? []) as ResidenceCountry[]
    },
  })
}

export type CurrentStatus = { id: string; name_ru: string; sort_order: number }

/** Справочник «Текущий статус» (плоский, ведётся вручную). */
export function useCurrentStatuses(countryId: string | null) {
  return useQuery({
    queryKey: ['residence', 'current-statuses', countryId],
    enabled: !!countryId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<CurrentStatus[]> => {
      const sb = getResidenceModuleClient()
      const { data, error } = await sb
        .schema(SCHEMA)
        .from('current_statuses')
        .select('id,name_ru,sort_order')
        .eq('country_id', countryId as string)
        .eq('is_active', true)
        .order('sort_order')
        .order('name_ru')
      if (error) throw error
      return (data ?? []) as CurrentStatus[]
    },
  })
}


/** Полный справочник по одной стране: виды ВНЖ, группы, критерии, links, rules. */
export function useResidenceCatalog(countryId: string | null) {
  return useQuery({
    queryKey: ['residence', 'catalog', countryId],
    enabled: !!countryId,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ResidenceCatalog> => {
      const sb = getResidenceModuleClient()
      const cid = countryId as string

      const [typesRes, groupsRes, criteriaRes, linksRes] = await Promise.all([
        sb.schema(SCHEMA).from('residence_types').select('*')
          .eq('country_id', cid).eq('is_active', true),
        sb.schema(SCHEMA).from('criteria_groups').select('*')
          .eq('country_id', cid).eq('is_active', true).order('display_order'),
        sb.schema(SCHEMA).from('criteria').select('*')
          .eq('country_id', cid).eq('is_active', true).order('display_order'),
        sb.schema(SCHEMA).from('links').select('*')
          .eq('country_id', cid).eq('is_active', true).order('priority'),
      ])

      for (const r of [typesRes, groupsRes, criteriaRes, linksRes]) {
        if (r.error) throw r.error
      }

      const links = (linksRes.data ?? []) as ResidenceLink[]

      // Правила привязаны к links (ВНЖ+процедура) — грузим по link_id.
      let rules: ResidenceRule[] = []
      if (links.length > 0) {
        const { data: rulesData, error: rulesErr } = await sb
          .schema(SCHEMA)
          .from('rules')
          .select('*')
          .in('link_id', links.map((l) => l.id))
          .eq('is_active', true)
        if (rulesErr) throw rulesErr
        rules = (rulesData ?? []) as ResidenceRule[]
      }

      return {
        residenceTypes: (typesRes.data ?? []) as ResidenceCatalog['residenceTypes'],
        groups: (groupsRes.data ?? []) as ResidenceCatalog['groups'],
        criteria: (criteriaRes.data ?? []) as ResidenceCatalog['criteria'],
        links,
        rules,
      }
    },
  })
}
