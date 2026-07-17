import { describe, it, expect } from 'vitest'
import { compareTasks } from './useFilteredListData'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

const task = (id: string, deadline: string | null): WorkspaceTask =>
  ({ id, deadline, created_at: '2026-01-01T00:00:00Z', name: id }) as unknown as WorkspaceTask

const sortByDeadline = (arr: WorkspaceTask[], dir: 'asc' | 'desc') =>
  [...arr].sort((a, b) => compareTasks(a, b, 'deadline', dir)).map((t) => t.id)

describe('compareTasks — сортировка по сроку', () => {
  const overdue = task('overdue', '2026-07-15T00:00:00Z')     // просрочено, дата без времени
  const allDay = task('allday', '2026-07-17T00:00:00Z')       // сегодня, весь день (полночь)
  const timed1 = task('timed1', '2026-07-17T09:15:00Z')       // сегодня 09:15
  const timed2 = task('timed2', '2026-07-17T10:30:00Z')       // сегодня 10:30
  const none1 = task('none1', null)
  const none2 = task('none2', null)

  it('asc: время того же дня выше «весь день»; без срока в конце', () => {
    // timed1(09:15) < timed2(10:30) < allDay(конец дня 07-17) < none
    expect(sortByDeadline([none1, allDay, timed2, timed1, none2], 'asc'))
      .toEqual(['timed1', 'timed2', 'allday', 'none1', 'none2'])
  })

  it('просроченный «весь день» (07-15) всё равно раньше сегодняшних', () => {
    expect(sortByDeadline([timed1, allDay, overdue], 'asc'))
      .toEqual(['overdue', 'timed1', 'allday'])
  })

  it('desc: со сроком по убыванию, но без срока ВСЁ РАВНО в конце', () => {
    expect(sortByDeadline([none1, timed1, timed2, none2], 'desc'))
      .toEqual(['timed2', 'timed1', 'none1', 'none2'])
  })
})
