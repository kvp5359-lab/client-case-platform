import { describe, it, expect } from 'vitest'
import { buildMentionItems, type MentionCandidate } from './mentionCandidates'

const p = (over: Partial<MentionCandidate> & { id: string; name: string }): MentionCandidate => ({
  user_id: `u-${over.id}`,
  last_name: null,
  avatar_url: null,
  workspace_roles: ['Сотрудник'],
  can_login: true,
  ...over,
})

describe('buildMentionItems', () => {
  it('связанные с задачей первыми, затем сотрудники; обе группы по алфавиту', () => {
    const items = buildMentionItems({
      participants: [
        p({ id: 'b', name: 'Борис' }),
        p({ id: 'a', name: 'Анна' }),
        p({ id: 'z', name: 'Зоя' }),
        p({ id: 'v', name: 'Вера' }),
      ],
      relatedIds: new Set(['z', 'v']),
      currentUserId: 'me',
      includeWorkspaceStaff: true,
    })
    expect(items.map((i) => i.label)).toEqual(['Вера', 'Зоя', 'Анна', 'Борис'])
    expect(items.map((i) => i.group)).toEqual(['related', 'related', 'staff', 'staff'])
  })

  it('личный диалог (includeWorkspaceStaff=false): только связанные', () => {
    const items = buildMentionItems({
      participants: [p({ id: 'a', name: 'Анна' }), p({ id: 'b', name: 'Борис' })],
      relatedIds: new Set(['a']),
      currentUserId: 'me',
      includeWorkspaceStaff: false,
    })
    expect(items.map((i) => i.id)).toEqual(['a'])
  })

  it('в общий список не попадают клиенты, заблокированные и без staff-роли', () => {
    const items = buildMentionItems({
      participants: [
        p({ id: 'client', name: 'Клиент', workspace_roles: ['Клиент'] }),
        p({ id: 'blocked', name: 'Заблокированный', can_login: false }),
        p({ id: 'custom', name: 'Внешний', workspace_roles: ['Внешний сотрудник'] }),
        p({ id: 'norole', name: 'Безролевой', workspace_roles: null }),
        p({ id: 'ok', name: 'Сотрудник' }),
      ],
      relatedIds: new Set(),
      currentUserId: 'me',
      includeWorkspaceStaff: true,
    })
    expect(items.map((i) => i.id)).toEqual(['ok'])
  })

  it('связанный клиент-участник проекта остаётся упоминаемым (старое поведение)', () => {
    const items = buildMentionItems({
      participants: [p({ id: 'client', name: 'Клиент', workspace_roles: ['Клиент'] })],
      relatedIds: new Set(['client']),
      currentUserId: 'me',
      includeWorkspaceStaff: true,
    })
    expect(items.map((i) => i.id)).toEqual(['client'])
  })

  it('исключает себя и участников без аккаунта (telegram-контакты)', () => {
    const items = buildMentionItems({
      participants: [
        p({ id: 'self', name: 'Я', user_id: 'me' }),
        p({ id: 'tg', name: 'ТГ-контакт', user_id: null }),
        p({ id: 'ok', name: 'Коллега' }),
      ],
      relatedIds: new Set(['self', 'tg', 'ok']),
      currentUserId: 'me',
      includeWorkspaceStaff: true,
    })
    expect(items.map((i) => i.id)).toEqual(['ok'])
  })

  it('label собирается из имени и фамилии', () => {
    const items = buildMentionItems({
      participants: [p({ id: 'a', name: 'Анна', last_name: 'Иванова' })],
      relatedIds: new Set(['a']),
      currentUserId: 'me',
      includeWorkspaceStaff: false,
    })
    expect(items[0].label).toBe('Анна Иванова')
  })
})
