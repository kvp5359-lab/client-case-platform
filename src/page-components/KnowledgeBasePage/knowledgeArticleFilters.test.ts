import { describe, it, expect } from 'vitest'
import { applyFilters } from '@/lib/filters/filterEngine'
import type { FilterGroup, FilterContext } from '@/lib/filters/types'
import {
  knowledgeFieldAccessors,
  buildKnowledgeJunctionAccessors,
  quickChipsToFilterRules,
  buildCombinedFilter,
  parseFilterToChips,
  extraConditions,
} from './knowledgeArticleFilters'
import type { KnowledgeArticle } from './useKnowledgeBasePage.types'

// ── Фикстуры ─────────────────────────────────────────────
function article(over: Partial<KnowledgeArticle> & { id: string }): KnowledgeArticle {
  return {
    workspace_id: 'w1',
    title: '',
    content: null,
    access_mode: 'read_only',
    is_published: true,
    status_id: null,
    statuses: null,
    created_by: null,
    author_email: null,
    author_name: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    indexing_status: 'completed',
    indexed_at: null,
    knowledge_article_groups: [],
    knowledge_article_tags: [],
    ...over,
  }
}

const ARTICLES: KnowledgeArticle[] = [
  article({
    id: 'a1', title: 'Виза D', status_id: 's_done', created_by: 'u1', is_published: true,
    knowledge_article_groups: [{ group_id: 'g_visa', sort_order: 0, knowledge_groups: null }],
    knowledge_article_tags: [{ tag_id: 't_arraigo', knowledge_tags: null }],
  }),
  article({
    id: 'a2', title: 'Аренда жилья', status_id: 's_draft', created_by: 'u2', is_published: false,
    knowledge_article_groups: [{ group_id: 'g_housing', sort_order: 0, knowledge_groups: null }],
    knowledge_article_tags: [],
  }),
  article({
    id: 'a3', title: 'Виза для номадов', status_id: null, created_by: 'u1', is_published: true,
    knowledge_article_groups: [
      { group_id: 'g_visa', sort_order: 0, knowledge_groups: null },
      { group_id: 'g_housing', sort_order: 1, knowledge_groups: null },
    ],
    knowledge_article_tags: [{ tag_id: 't_nomad', knowledge_tags: null }],
  }),
]

function ctx(over: Partial<FilterContext> = {}): FilterContext {
  return { currentUserId: 'u1', currentParticipantId: 'p1', now: new Date('2026-07-07T12:00:00Z'), ...over }
}

function run(filters: FilterGroup, over: Partial<FilterContext> = {}) {
  return applyFilters(
    ARTICLES,
    filters,
    ctx(over),
    knowledgeFieldAccessors,
    buildKnowledgeJunctionAccessors(ARTICLES),
  ).map((a) => a.id)
}

describe('knowledgeArticleFilters — обычные поля', () => {
  it('пустой фильтр — все статьи', () => {
    expect(run({ logic: 'and', rules: [] })).toEqual(['a1', 'a2', 'a3'])
  })

  it('status_id in [s_done]', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'in', value: ['s_done'] }] })).toEqual(['a1'])
  })

  it('status_id = __no_status__ ловит null', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'equals', value: '__no_status__' }] })).toEqual(['a3'])
  })

  it('is_published = false', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'is_published', operator: 'equals', value: false }] })).toEqual(['a2'])
  })

  it('title contains "виза" (case-insensitive)', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'виза' }] })).toEqual(['a1', 'a3'])
  })

  it('created_by = __me__ (u1)', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'created_by', operator: 'equals', value: '__me__' }] })).toEqual(['a1', 'a3'])
  })
})

describe('knowledgeArticleFilters — junction (группы/теги)', () => {
  it('groups in [g_visa]', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'groups', operator: 'in', value: ['g_visa'] }] })).toEqual(['a1', 'a3'])
  })

  it('tags in [t_nomad]', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'tags', operator: 'in', value: ['t_nomad'] }] })).toEqual(['a3'])
  })

  it('tags is_null (без тегов)', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'tags', operator: 'is_null', value: null }] })).toEqual(['a2'])
  })

  it('groups not_in [g_housing]', () => {
    expect(run({ logic: 'and', rules: [{ type: 'condition', field: 'groups', operator: 'not_in', value: ['g_housing'] }] })).toEqual(['a1'])
  })
})

describe('quickChipsToFilterRules — быстрые чипы в условия', () => {
  const runRules = (rules: ReturnType<typeof quickChipsToFilterRules>) =>
    applyFilters(
      ARTICLES,
      { logic: 'and', rules },
      ctx(),
      knowledgeFieldAccessors,
      buildKnowledgeJunctionAccessors(ARTICLES),
    ).map((a) => a.id)

  it('статус in [s_done]', () => {
    expect(runRules(quickChipsToFilterRules(['s_done'], [], []))).toEqual(['a1'])
  })

  it('статус __none__ → без статуса', () => {
    expect(runRules(quickChipsToFilterRules(['__none__'], [], []))).toEqual(['a3'])
  })

  it('группа __none__ → без группы (пусто у всех есть группа → никого)', () => {
    expect(runRules(quickChipsToFilterRules([], ['__none__'], []))).toEqual([])
  })

  it('тег __none__ → без тега', () => {
    expect(runRules(quickChipsToFilterRules([], [], ['__none__']))).toEqual(['a2'])
  })

  it('тег [t_nomad] ИЛИ без тега', () => {
    expect(runRules(quickChipsToFilterRules([], [], ['t_nomad', '__none__']))).toEqual(['a2', 'a3'])
  })
})

describe('buildCombinedFilter — объединение чипов и расширенного', () => {
  const empty = { logic: 'and' as const, rules: [] }

  it('только чипы → and-обёртка', () => {
    const f = buildCombinedFilter(['s_done'], [], [], empty)
    expect(f).toEqual({ logic: 'and', rules: [{ type: 'condition', field: 'status_id', operator: 'in', value: ['s_done'] }] })
  })

  it('только расширенный → возвращается как есть', () => {
    const adv = { logic: 'or' as const, rules: [{ type: 'condition' as const, field: 'title', operator: 'contains', value: 'виза' }] }
    expect(buildCombinedFilter([], [], [], adv)).toBe(adv)
  })

  it('чипы + расширенный → расширенный вложен группой (сохраняет OR)', () => {
    const adv = { logic: 'or' as const, rules: [{ type: 'condition' as const, field: 'title', operator: 'contains', value: 'виза' }] }
    const f = buildCombinedFilter(['s_done'], [], [], adv)
    expect(f.logic).toBe('and')
    expect(f.rules).toHaveLength(2)
    expect(f.rules[1]).toEqual({ type: 'group', group: adv })
  })
})

describe('parseFilterToChips — раскладка фильтра на чипы (round-trip)', () => {
  const empty = { logic: 'and' as const, rules: [] }

  it('статус round-trip', () => {
    const f = buildCombinedFilter(['s_done', '__none__'], [], [], empty)
    const p = parseFilterToChips(f)
    expect(p.statusIds.sort()).toEqual(['__none__', 's_done'].sort())
    expect(p.advanced.rules).toEqual([])
  })

  it('группа с «без» (OR) round-trip', () => {
    const f = buildCombinedFilter([], ['g_visa', '__none__'], [], empty)
    const p = parseFilterToChips(f)
    expect(p.groupIds.sort()).toEqual(['__none__', 'g_visa'].sort())
  })

  it('тег только «без» round-trip', () => {
    const f = buildCombinedFilter([], [], ['__none__'], empty)
    expect(parseFilterToChips(f).tagIds).toEqual(['__none__'])
  })

  it('доп. условие (автор) уходит в advanced, не в чипы', () => {
    const adv = { logic: 'and' as const, rules: [{ type: 'condition' as const, field: 'created_by', operator: 'equals', value: '__me__' }] }
    const f = buildCombinedFilter(['s_done'], [], [], adv)
    const p = parseFilterToChips(f)
    expect(p.statusIds).toEqual(['s_done'])
    expect(p.advanced.rules).toEqual(adv.rules)
    expect(extraConditions(f).map((c) => c.field)).toEqual(['created_by'])
  })
})

describe('knowledgeArticleFilters — комбинация AND/OR', () => {
  it('группа g_visa И опубликовано', () => {
    expect(run({
      logic: 'and',
      rules: [
        { type: 'condition', field: 'groups', operator: 'in', value: ['g_visa'] },
        { type: 'condition', field: 'is_published', operator: 'equals', value: true },
      ],
    })).toEqual(['a1', 'a3'])
  })

  it('статус s_draft ИЛИ тег t_nomad', () => {
    expect(run({
      logic: 'or',
      rules: [
        { type: 'condition', field: 'status_id', operator: 'equals', value: 's_draft' },
        { type: 'condition', field: 'tags', operator: 'in', value: ['t_nomad'] },
      ],
    })).toEqual(['a2', 'a3'])
  })
})
