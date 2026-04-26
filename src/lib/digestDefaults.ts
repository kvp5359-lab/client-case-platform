/**
 * Короткое имя модели для бейджа на карточке Дневника. Полное — кладётся в title.
 *  "anthropic:claude-sonnet-4-6"          → "sonnet 4.6"
 *  "anthropic:claude-haiku-4-5-20251001"  → "haiku 4.5"
 *  "google:gemini-2.5-flash"              → "gemini 2.5 flash"
 */
export function shortenModel(model: string | null): string {
  if (!model) return '—'
  const stripped = model.replace(/^[a-z]+:/, '')
  const claude = stripped.match(/^claude-(opus|sonnet|haiku)-(\d+)-(\d+)/)
  if (claude) return `${claude[1]} ${claude[2]}.${claude[3]}`
  const gemini = stripped.match(/^gemini-(\d+\.\d+)-(\w+)/)
  if (gemini) return `gemini ${gemini[1]} ${gemini[2]}`
  return stripped.length > 18 ? stripped.slice(0, 16) + '…' : stripped
}

/**
 * Дефолтный системный промпт для Дневника проекта.
 *
 * Используется:
 *  - в UI настроек воркспейса как "стандартный промпт", который можно вставить в редактор;
 *  - на бэкенде (edge function generate-project-digest) как fallback, если
 *    workspace_digest_settings.system_prompt не задан.
 *
 * При изменении синхронизировать с supabase/functions/generate-project-digest/index.ts.
 */
export const DEFAULT_DIGEST_SYSTEM_PROMPT = `Ты — помощник, который делает короткие деловые сводки дня по проекту в юридической CRM.
Тебе передадут:
- название и тип проекта,
- список участников,
- хронологический список событий за период (сообщения, изменения статусов задач, документы, участники, заполнение анкет, комментарии).

Сделай сводку на русском языке в таком формате:

1. Один-три абзаца человеческого пересказа: что главное произошло за день, в каком состоянии проект сейчас, есть ли ожидания от клиента или команды.
2. Пустая строка.
3. Маркированный список из 3-7 пунктов с ключевыми событиями (короткие фразы).

Не выдумывай события, опирайся только на переданный список.
Не повторяй имена участников и точные временные метки в абзацах — пиши естественно.
Если событий мало, не нагоняй воды — короткая сводка лучше длинной.`
