export type DeadlineGroup = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_deadline'

/**
 * Ключ сортировки по сроку (мс). Срок «на весь день» (дата без времени хранится
 * как полночь UTC) считается КОНЦОМ дня (+почти сутки) — тогда задачи с
 * конкретным временем того же дня сортируются ВЫШЕ, а «на весь день» — под ними.
 * `null` — срока нет (вызывающий кладёт такие в конец). Сам дедлайн не меняется,
 * это только ключ сравнения.
 */
export function deadlineSortValue(deadline: string | null | undefined): number | null {
  if (!deadline) return null
  const d = new Date(deadline)
  const t = d.getTime()
  if (Number.isNaN(t)) return null
  const isAllDay =
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  return isAllDay ? t + (24 * 60 * 60 - 1) * 1000 : t
}

/** Разница в КАЛЕНДАРНЫХ днях между сроком и сегодня (по локальной дате). */
export function deadlineDayDiff(deadline: string | Date): number {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((dd.getTime() - today.getTime()) / 86_400_000)
}

export type DeadlineAccentVariant = 'chip' | 'text'

/**
 * ЕДИНЫЙ источник правды по цветовому акценту срока (используй везде, где
 * показывается дата дедлайна — chip в задачах, поле «Срок» в диалоге создания,
 * ячейки в строках досок). Цвет по близости к сегодня:
 *   просрочено → красный, сегодня → оранжевый, завтра → синий,
 *   послезавтра → зелёный, позже / без срока → нейтральный.
 *
 * - variant='chip' — текст + фон + font-medium + hover (для кнопок-чипов).
 * - variant='text' — только цвет текста (для плотных строк/ячеек).
 * - isFinal=true (задача завершена/отменена) — без подсветки срочности.
 */
export function getDeadlineAccentClass(
  deadline: string | Date | null,
  opts: { variant?: DeadlineAccentVariant; isFinal?: boolean } = {},
): string {
  const { variant = 'chip', isFinal = false } = opts
  if (!deadline) {
    return variant === 'chip'
      ? 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
      : 'text-muted-foreground/60'
  }
  const diff = isFinal ? null : deadlineDayDiff(deadline)
  const tone =
    diff == null ? 'later'
      : diff < 0 ? 'overdue'
        : diff === 0 ? 'today'
          : diff === 1 ? 'tomorrow'
            : diff === 2 ? 'soon'
              : 'later'

  if (variant === 'chip') {
    switch (tone) {
      case 'overdue': return 'text-red-600 bg-red-50 font-medium hover:bg-red-100'
      case 'today': return 'text-orange-600 bg-orange-50 font-medium hover:bg-orange-100'
      case 'tomorrow': return 'text-blue-600 bg-blue-50 font-medium hover:bg-blue-100'
      case 'soon': return 'text-green-600 bg-green-50 font-medium hover:bg-green-100'
      default: return 'text-muted-foreground bg-gray-100 hover:text-foreground hover:bg-gray-200'
    }
  }
  switch (tone) {
    case 'overdue': return 'text-red-600'
    case 'today': return 'text-orange-600'
    case 'tomorrow': return 'text-blue-600'
    case 'soon': return 'text-green-600'
    default: return 'text-muted-foreground'
  }
}

/**
 * Возвращает группу срока задачи относительно текущей даты.
 */
export function getDeadlineGroup(deadline: string | null): DeadlineGroup {
  if (!deadline) return 'no_deadline'

  const d = new Date(deadline)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const endOfWeek = new Date(today)
  const dayOfWeek = today.getDay()
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
  endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday + 1)

  const deadlineDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (deadlineDay < today) return 'overdue'
  if (deadlineDay.getTime() === today.getTime()) return 'today'
  if (deadlineDay.getTime() === tomorrow.getTime()) return 'tomorrow'
  if (deadlineDay < endOfWeek) return 'this_week'
  return 'later'
}

// ─────────────────────────────────────────────────────────────────────────
// Настраиваемое отображение срока (формат задаётся на уровне воркспейса).
// Две независимые опции: «близкая» дата (есть относительный ярлык) и «дальняя».
// ─────────────────────────────────────────────────────────────────────────

/** Формат «близкой» даты — вчера/сегодня/завтра/послезавтра. */
export type DeadlineNearFormat = 'label' | 'label_numeric' | 'label_text'
/** Формат «дальней» даты — без относительного ярлыка. */
export type DeadlineFarFormat = 'numeric' | 'text' | 'text_weekday'

export const DEFAULT_DEADLINE_NEAR_FORMAT: DeadlineNearFormat = 'label'
export const DEFAULT_DEADLINE_FAR_FORMAT: DeadlineFarFormat = 'text'

/** Относительный ярлык для близких дат (или null, если дата «дальняя»). */
function relativeDeadlineLabel(diff: number): string | null {
  switch (diff) {
    case -1: return 'Вчера'
    case 0: return 'Сегодня'
    case 1: return 'Завтра'
    case 2: return 'Послезавтра'
    default: return null
  }
}

/** «10.06.26» */
function fmtNumeric(d: Date): string {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

/** «25 дек» (год добавляется только если он не текущий: «25 дек. 2027»). */
function fmtText(d: Date): string {
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('ru-RU', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' })
}

/** «Пт, 25 дек» */
function fmtTextWeekday(d: Date): string {
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'short' })
  const wdCap = wd.charAt(0).toUpperCase() + wd.slice(1)
  return `${wdCap}, ${fmtText(d)}`
}

/** Форматирует «дальнюю» дату по выбранному формату. */
function formatFarDate(d: Date, far: DeadlineFarFormat): string {
  switch (far) {
    case 'numeric': return fmtNumeric(d)
    case 'text_weekday': return fmtTextWeekday(d)
    case 'text':
    default: return fmtText(d)
  }
}

/**
 * ЕДИНЫЙ форматтер даты срока с учётом настроек воркспейса.
 * Близкая дата (вчера/сегодня/завтра/послезавтра) → формат `near`,
 * остальные → формат `far`. Возвращает только дату (время добавляют вызыватели).
 * null если дедлайн пустой/невалидный.
 */
export function formatDeadlineDisplay(
  deadline: string | Date | null,
  opts: { near?: DeadlineNearFormat; far?: DeadlineFarFormat } = {},
): string | null {
  if (!deadline) return null
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline
  if (Number.isNaN(d.getTime())) return null

  const near = opts.near ?? DEFAULT_DEADLINE_NEAR_FORMAT
  const far = opts.far ?? DEFAULT_DEADLINE_FAR_FORMAT
  const label = relativeDeadlineLabel(deadlineDayDiff(d))

  if (label) {
    switch (near) {
      case 'label_numeric': return `${label}, ${fmtNumeric(d)}`
      case 'label_text': return `${label}, ${fmtText(d)}`
      case 'label':
      default: return label
    }
  }
  return formatFarDate(d, far)
}

/**
 * Короткое форматирование дедлайна: «Сегодня» / «Завтра» / «Вчера» / «15 мая».
 * null если дедлайн пустой.
 */
export function formatDeadline(deadline: string | null): string | null {
  if (!deadline) return null
  const d = new Date(deadline)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((taskDate.getTime() - today.getTime()) / 86400000)

  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Завтра'
  if (diffDays === -1) return 'Вчера'

  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

/** true если дедлайн в прошлом (по дате, не по времени). */
export function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false
  return new Date(deadline) < new Date(new Date().toDateString())
}

/**
 * Группа дедлайна для рендера в UI: «Просрочено» / «Сегодня» / «Завтра» /
 * «На этой неделе» / «Позже» / «Без дедлайна».
 */
export function formatDeadlineGroup(deadline: string | null): string {
  if (!deadline) return 'Без дедлайна'
  const d = new Date(deadline)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((taskDate.getTime() - today.getTime()) / 86400000)

  if (diffDays < 0) return 'Просрочено'
  if (diffDays === 0) return 'Сегодня'
  if (diffDays === 1) return 'Завтра'
  if (diffDays <= 7) return 'На этой неделе'
  return 'Позже'
}
