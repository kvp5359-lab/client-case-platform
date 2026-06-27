/**
 * Чистая логика расписания повторяющихся задач (RRULE-подмножество).
 * Зеркалит SQL-функцию public.recurring_next_occurrence для превью на фронте
 * и даёт человекочитаемое описание. Источник правды по генерации — БД;
 * здесь только превью/описание, поэтому часовой пояс трактуется как локальный
 * (для подписи «ближайшие даты» этого достаточно).
 *
 * План: docs/feature-backlog/2026-06-27-recurring-tasks.md
 */

export type RecurrenceFreq = 'daily' | 'weekly' | 'monthly'

export type RecurrenceSchedule = {
  freq: RecurrenceFreq
  /** ISO дни недели 1..7 (Пн..Вс), используется при freq='weekly' */
  byweekday: number[]
  /** число месяца 1..31 или -1 (последний день), используется при freq='monthly' */
  bymonthday: number | null
  /** 'HH:MM' */
  fireTime: string
  /** 'YYYY-MM-DD' */
  startsOn?: string | null
  /** 'YYYY-MM-DD' */
  untilDate?: string | null
}

/** ISO дни недели: 1=Пн … 7=Вс */
export const WEEKDAYS: { iso: number; short: string; long: string }[] = [
  { iso: 1, short: 'Пн', long: 'Понедельник' },
  { iso: 2, short: 'Вт', long: 'Вторник' },
  { iso: 3, short: 'Ср', long: 'Среда' },
  { iso: 4, short: 'Чт', long: 'Четверг' },
  { iso: 5, short: 'Пт', long: 'Пятница' },
  { iso: 6, short: 'Сб', long: 'Суббота' },
  { iso: 7, short: 'Вс', long: 'Воскресенье' },
]

/** JS Date → ISO день недели (1=Пн … 7=Вс) */
export function isoDay(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1
}

/** Последний день месяца для заданной даты */
export function lastDayOfMonth(year: number, monthZeroBased: number): number {
  return new Date(year, monthZeroBased + 1, 0).getDate()
}

function parseFireTime(fireTime: string): { h: number; m: number } {
  const [h, m] = (fireTime || '09:00').split(':').map((x) => parseInt(x, 10))
  return { h: Number.isFinite(h) ? h : 9, m: Number.isFinite(m) ? m : 0 }
}

function parseYmd(ymd?: string | null): Date | null {
  if (!ymd) return null
  const [y, mo, d] = ymd.split('-').map((x) => parseInt(x, 10))
  if (!y || !mo || !d) return null
  return new Date(y, mo - 1, d)
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function matchesDay(cand: Date, schedule: RecurrenceSchedule): boolean {
  if (schedule.freq === 'daily') return true
  if (schedule.freq === 'weekly') {
    if (!schedule.byweekday || schedule.byweekday.length === 0) return false
    return schedule.byweekday.includes(isoDay(cand))
  }
  // monthly
  const last = lastDayOfMonth(cand.getFullYear(), cand.getMonth())
  const target = schedule.bymonthday === -1 ? last : Math.min(schedule.bymonthday ?? 1, last)
  return cand.getDate() === target
}

/**
 * Ближайшие `count` дат создания после `from` (включительно по дате, но строго
 * позже момента `from`). Возвращает Date в локальном времени.
 */
export function nextOccurrences(
  schedule: RecurrenceSchedule,
  from: Date,
  count: number,
): Date[] {
  const out: Date[] = []
  const { h, m } = parseFireTime(schedule.fireTime)
  const startsOn = parseYmd(schedule.startsOn)
  const untilDate = parseYmd(schedule.untilDate)
  const base = dateOnly(from)

  for (let i = 0; i < 800 && out.length < count; i++) {
    const cand = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i)
    if (startsOn && cand < startsOn) continue
    if (untilDate && cand > untilDate) break
    if (!matchesDay(cand, schedule)) continue
    const ts = new Date(cand.getFullYear(), cand.getMonth(), cand.getDate(), h, m, 0, 0)
    if (ts > from) out.push(ts)
  }
  return out
}

/** Человекочитаемое описание расписания, напр. «Еженедельно: Пн, Ср в 09:00». */
export function describeSchedule(schedule: RecurrenceSchedule): string {
  const time = (schedule.fireTime || '09:00').slice(0, 5)
  if (schedule.freq === 'daily') {
    return `Ежедневно в ${time}`
  }
  if (schedule.freq === 'weekly') {
    const days = [...(schedule.byweekday ?? [])].sort((a, b) => a - b)
    if (days.length === 0) return `Еженедельно в ${time}`
    if (days.length === 7) return `Ежедневно в ${time}`
    if (days.length === 5 && days.every((d) => d >= 1 && d <= 5)) {
      return `По будням в ${time}`
    }
    const labels = days
      .map((iso) => WEEKDAYS.find((w) => w.iso === iso)?.short)
      .filter(Boolean)
      .join(', ')
    return `Еженедельно: ${labels} в ${time}`
  }
  // monthly
  if (schedule.bymonthday === -1) {
    return `Ежемесячно в последний день месяца в ${time}`
  }
  return `Ежемесячно ${schedule.bymonthday ?? 1}-го числа в ${time}`
}
