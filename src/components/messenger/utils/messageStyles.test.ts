import { describe, it, expect } from 'vitest'
import { resolveBubbleAppearance, TEAM_GRAY, type BubbleAppearanceInput } from './messageStyles'

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
    expect(a.incomingBubbleClass).toBe(TEAM_GRAY)
    expect(a.timestampPillBg).toBe(bg(TEAM_GRAY))
    expect(a.timestampPillBg).not.toContain('emerald')
  })

  it('своё «Команде» в клиентском треде: плашка чёрная, как бабл', () => {
    const a = at({ visibility: 'team', isOwn: true })
    expect(a.ownBubbleClass).toContain('bg-neutral-900')
    expect(a.timestampPillBg).toBe('bg-neutral-900')
  })

  it('своё «Заметка» (team + тихо): плашка тёмно-серая, как бабл', () => {
    const a = at({ visibility: 'team', notifySubscribers: false, isOwn: true })
    expect(a.ownBubbleClass).toContain('bg-neutral-600')
    expect(a.timestampPillBg).toBe('bg-neutral-600')
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
