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
