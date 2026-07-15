import type { BotIntegration } from './types'

type LeadBotConfig = BotIntegration['config']

export type LeadBotFormValues = {
  /** Пустая строка = «без шаблона» (легаси-путь). */
  templateId: string
  /** Ответственные в user_id — легаси-путь, читается только без шаблона. */
  responsibleUserIds: string[]
  welcome: string
  campaign: string
  showSenderName: boolean
}

/**
 * Конфиг лид-бота из значений формы.
 *
 * Главное правило: **поля другого пути не стираем**. С шаблоном ответственные,
 * владелец и приветствие не читаются (исполнители приходят из шаблона и его
 * переопределений), но если их обнулить — снятие шаблона оставит бота без
 * ответственных и без текста приветствия, а вернуть их будет неоткуда.
 * Поэтому пустые значения означают «не трогаем», а не «очистить».
 */
export function buildLeadBotConfig(
  prev: LeadBotConfig,
  form: LeadBotFormValues,
): LeadBotConfig {
  const next: LeadBotConfig = {
    ...prev,
    template_id: form.templateId || undefined,
    base_campaign: form.campaign.trim() || undefined,
    show_sender_name: form.showSenderName,
  }

  // Легаси-путь (бот без шаблона): ответственные редактируются в блоке бота,
  // первый из них — владелец диалога. С шаблоном полей на экране нет, поэтому
  // и записывать нечего — оставляем прежние значения.
  if (!form.templateId) {
    next.responsible_user_ids = form.responsibleUserIds
    next.owner_user_id = form.responsibleUserIds[0]
  }

  const welcome = form.welcome.trim()
  if (welcome) next.welcome_message = welcome
  else if (!form.templateId) next.welcome_message = undefined

  return next
}
