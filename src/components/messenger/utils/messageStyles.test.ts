import { describe, it, expect } from 'vitest'
import {
  resolveBubbleAppearance,
  TEAM_OWN,
  TEAM_INCOMING,
  TEAM_NOTE_OWN,
  type BubbleAppearanceInput,
} from './messageStyles'

const base: BubbleAppearanceInput = {
  accent: 'emerald',
  visibility: 'client',
  notifySubscribers: true,
  senderRole: 'Сотрудник',
  isDraft: false,
  isOwn: false,
  isClientThread: true,
  viewerIsClient: false,
  deliveryFailed: false,
}

const at = (over: Partial<BubbleAppearanceInput>) => resolveBubbleAppearance({ ...base, ...over })

/** Фон из строки классов (как это делает сам модуль). */
const bg = (classes: string) => classes.split(' ').find((c) => c.startsWith('bg-')) ?? ''

describe('resolveBubbleAppearance — плашка времени повторяет фон бабла', () => {
  // Регресс: у сообщения «Команде» в клиентском чате бабл серый, а плашка
  // времени оставалась цвета треда (считалась от сырого акцента).
  it('входящее «Команде» в клиентском треде: плашка серая, как бабл, а не акцент', () => {
    const a = at({ visibility: 'team', isOwn: false })
    expect(a.incomingBubbleClass).toBe(TEAM_INCOMING)
    expect(a.timestampPillBg).toBe(bg(TEAM_INCOMING))
    expect(a.timestampPillBg).not.toContain('emerald')
  })

  it('своё «Команде» в клиентском треде: плашка в командный цвет, как бабл', () => {
    const a = at({ visibility: 'team', isOwn: true })
    expect(a.ownBubbleClass).toBe(TEAM_OWN)
    expect(a.timestampPillBg).toBe(bg(TEAM_OWN))
  })

  it('своё «Заметка» (team + тихо): плашка в приглушённый командный тон', () => {
    const a = at({ visibility: 'team', notifySubscribers: false, isOwn: true })
    expect(a.ownBubbleClass).toBe(TEAM_NOTE_OWN)
    expect(a.timestampPillBg).toBe(bg(TEAM_NOTE_OWN))
  })

  // Командный цвет — настраиваемый (переменная палитры), а не жёсткий neutral.
  it('командные цвета берутся из палитры (--acc-team-*)', () => {
    expect(TEAM_OWN).toContain('--acc-team-main')
    expect(TEAM_INCOMING).toContain('--acc-team-light')
    expect(TEAM_NOTE_OWN).toContain('--acc-team-mid')
  })

  it('своё «Только я»: плашка жёлтая, как бабл', () => {
    const a = at({ visibility: 'self', isOwn: true })
    expect(a.timestampPillBg).toBe('bg-amber-200')
  })

  it('обычное клиентское сообщение: плашка в акцент треда (как было)', () => {
    const own = at({ isOwn: true })
    expect(own.timestampPillBg).toBe(bg(own.ownBubbleClass))
    const incoming = at({ isOwn: false })
    expect(incoming.timestampPillBg).toBe(bg(incoming.incomingBubbleClass))
  })

  it('во ВНУТРЕННЕМ треде «Команде» не перекрашивает — плашка в акцент', () => {
    const a = at({ visibility: 'team', isOwn: true, isClientThread: false })
    expect(a.timestampPillBg).toBe(bg(a.ownBubbleClass))
  })

  it('черновик и провал доставки — плашка белая (перебивают цвет бабла)', () => {
    expect(at({ isDraft: true, isOwn: true }).timestampPillBg).toBe('bg-white')
    expect(at({ isOwn: true, deliveryFailed: true }).timestampPillBg).toBe('bg-white')
  })
})
