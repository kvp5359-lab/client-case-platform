import { describe, it, expect } from 'vitest'
import { buildLeadBotConfig } from './leadBotConfig'

const form = {
  templateId: '',
  responsibleUserIds: [] as string[],
  welcome: '',
  campaign: '',
  showSenderName: false,
}

describe('buildLeadBotConfig — бот без шаблона (легаси-путь)', () => {
  it('пишет ответственных и владельцем делает первого', () => {
    const c = buildLeadBotConfig({}, { ...form, responsibleUserIds: ['u1', 'u2'] })
    expect(c.responsible_user_ids).toEqual(['u1', 'u2'])
    expect(c.owner_user_id).toBe('u1')
  })

  it('очистка поля ответственных действительно очищает', () => {
    const c = buildLeadBotConfig({ responsible_user_ids: ['u1'], owner_user_id: 'u1' }, form)
    expect(c.responsible_user_ids).toEqual([])
    expect(c.owner_user_id).toBeUndefined()
  })

  it('очистка приветствия действительно очищает', () => {
    const c = buildLeadBotConfig({ welcome_message: 'Привет' }, form)
    expect(c.welcome_message).toBeUndefined()
  })
})

describe('buildLeadBotConfig — бот с шаблоном', () => {
  const withTemplate = { ...form, templateId: 'tpl-1' }

  it('НЕ стирает ответственных и владельца: снятие шаблона вернёт их', () => {
    const prev = { responsible_user_ids: ['u1', 'u2'], owner_user_id: 'u1' }
    const c = buildLeadBotConfig(prev, withTemplate)
    expect(c.responsible_user_ids).toEqual(['u1', 'u2'])
    expect(c.owner_user_id).toBe('u1')
  })

  it('НЕ стирает приветствие: с шаблоном оно просто не читается', () => {
    const c = buildLeadBotConfig({ welcome_message: 'Привет' }, withTemplate)
    expect(c.welcome_message).toBe('Привет')
  })

  it('сохраняет выбранный шаблон', () => {
    expect(buildLeadBotConfig({}, withTemplate).template_id).toBe('tpl-1')
  })

  it('снятие шаблона убирает его из конфига', () => {
    const c = buildLeadBotConfig({ template_id: 'tpl-1' }, form)
    expect(c.template_id).toBeUndefined()
  })
})

describe('buildLeadBotConfig — общие поля', () => {
  it('метка кампании обрезается, пустая не хранится', () => {
    expect(buildLeadBotConfig({}, { ...form, campaign: '  промо1 ' }).base_campaign).toBe('промо1')
    expect(buildLeadBotConfig({ base_campaign: 'старое' }, form).base_campaign).toBeUndefined()
  })

  it('показ имени отправителя пишется как есть', () => {
    expect(buildLeadBotConfig({}, { ...form, showSenderName: true }).show_sender_name).toBe(true)
  })

  it('чужие поля конфига (токен, аватар) не теряются', () => {
    const prev = { bot_token: 'tok', bot_username: 'propia_bot', bot_avatar_url: 'https://a/b.jpg' }
    expect(buildLeadBotConfig(prev, form)).toMatchObject(prev)
  })
})
