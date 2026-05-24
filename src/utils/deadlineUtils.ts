export type DeadlineGroup = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'later' | 'no_deadline'

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
