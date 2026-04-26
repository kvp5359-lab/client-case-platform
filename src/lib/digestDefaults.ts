/**
 * Дневник: пресеты периодов.
 *
 * Все даты — в виде "YYYY-MM-DD" по тайм-зоне Europe/Madrid (как и в edge function).
 * Возвращают `{ start, end }` — обе включительно.
 */

const TIMEZONE = 'Europe/Madrid'

function dateInMadrid(d: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function shiftDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** День недели по Мадриду: 0=пн, 6=вс. */
function madridDayOfWeekIso(date: string): number {
  const d = new Date(date + 'T12:00:00Z')
  const dow = d.getUTCDay() // 0=вс ... 6=сб
  return (dow + 6) % 7 // 0=пн ... 6=вс
}

export interface DigestPeriod {
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD (включительно)
}

export interface DigestPreset {
  id: string
  label: string
  compute: () => DigestPeriod
}

export const DIGEST_PRESETS: DigestPreset[] = [
  {
    id: 'today',
    label: 'Сегодня',
    compute: () => {
      const t = dateInMadrid(new Date())
      return { start: t, end: t }
    },
  },
  {
    id: 'yesterday',
    label: 'Вчера',
    compute: () => {
      const y = shiftDays(dateInMadrid(new Date()), -1)
      return { start: y, end: y }
    },
  },
  {
    id: 'last7',
    label: 'Последние 7 дней',
    compute: () => {
      const t = dateInMadrid(new Date())
      return { start: shiftDays(t, -6), end: t }
    },
  },
  {
    id: 'thisWeek',
    label: 'Текущая неделя',
    compute: () => {
      const t = dateInMadrid(new Date())
      const dow = madridDayOfWeekIso(t)
      return { start: shiftDays(t, -dow), end: t }
    },
  },
  {
    id: 'lastWeek',
    label: 'Прошлая неделя',
    compute: () => {
      const t = dateInMadrid(new Date())
      const dow = madridDayOfWeekIso(t)
      const lastSun = shiftDays(t, -dow - 1)
      const lastMon = shiftDays(lastSun, -6)
      return { start: lastMon, end: lastSun }
    },
  },
  {
    id: 'weekend',
    label: 'Прошлые выходные',
    compute: () => {
      const t = dateInMadrid(new Date())
      const dow = madridDayOfWeekIso(t) // 0=пн, 5=сб, 6=вс
      // Сдвиг к ближайшему прошедшему воскресенью.
      const lastSun = dow >= 6 ? shiftDays(t, -(dow - 6) - 7) : shiftDays(t, -dow - 1)
      const lastSat = shiftDays(lastSun, -1)
      return { start: lastSat, end: lastSun }
    },
  },
  {
    id: 'thisMonth',
    label: 'Текущий месяц',
    compute: () => {
      const t = dateInMadrid(new Date())
      return { start: t.slice(0, 8) + '01', end: t }
    },
  },
  {
    id: 'lastMonth',
    label: 'Прошлый месяц',
    compute: () => {
      const t = dateInMadrid(new Date())
      const firstOfThisMonth = t.slice(0, 8) + '01'
      const lastOfPrev = shiftDays(firstOfThisMonth, -1)
      const firstOfPrev = lastOfPrev.slice(0, 8) + '01'
      return { start: firstOfPrev, end: lastOfPrev }
    },
  },
]

/**
 * Возвращает подходящее значение `digest_type` для пары дат.
 */
export function digestTypeForPeriod(period: DigestPeriod): 'day' | 'custom' {
  return period.start === period.end ? 'day' : 'custom'
}

/**
 * Человекочитаемый заголовок периода для карточки. Сокращённый формат.
 *  start === end          → "Пт, 24 апр 2026"
 *  один месяц             → "20—26 апр 2026"
 *  разные месяцы          → "20 апр — 5 мая 2026"
 *  разные годы            → "20 дек 2025 — 5 янв 2026"
 */
export function formatPeriodLabel(start: string, end: string): string {
  if (start === end) {
    const d = new Date(start + 'T12:00:00Z')
    const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' })
    const rest = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ г\.?$/, '')
    const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1, 2) // "Пт", "Вс"
    return `${wdCap}, ${rest}`
  }
  const a = new Date(start + 'T12:00:00Z')
  const b = new Date(end + 'T12:00:00Z')
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear()
  const sameMonth = sameYear && a.getUTCMonth() === b.getUTCMonth()
  const stripGod = (s: string) => s.replace(/ г\.?$/, '')
  if (sameMonth) {
    return stripGod(`${a.getUTCDate()}—${b.getUTCDate()} ${b.toLocaleDateString('ru-RU', { month: 'short', year: 'numeric' })}`)
  }
  if (sameYear) {
    const aS = a.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    const bS = stripGod(b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }))
    return `${aS} — ${bS}`
  }
  const aS = stripGod(a.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }))
  const bS = stripGod(b.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }))
  return `${aS} — ${bS}`
}

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
