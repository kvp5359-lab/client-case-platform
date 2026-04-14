import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { GroupByField } from './types'

// ── Форматирование дедлайна ─────────────────────────────

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

export function isOverdue(deadline: string | null): boolean {
  if (!deadline) return false
  return new Date(deadline) < new Date(new Date().toDateString())
}

// ── Группировка ─────────────────────────────────────────

export interface TaskGroup {
  key: string
  label: string
  tasks: WorkspaceTask[]
}

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

export function groupTasks(
  tasks: WorkspaceTask[],
  groupBy: GroupByField,
  assigneesMap: Record<string, AvatarParticipant[]>,
  statuses: StatusOption[],
): TaskGroup[] {
  if (groupBy === 'none') return [{ key: '__all__', label: '', tasks }]

  const map = new Map<string, WorkspaceTask[]>()
  const labelMap = new Map<string, string>()

  for (const task of tasks) {
    let keys: string[]

    switch (groupBy) {
      case 'status': {
        const k = task.status_id ?? '__none__'
        const s = statuses.find((s) => s.id === task.status_id)
        keys = [k]
        labelMap.set(k, s?.name ?? 'Без статуса')
        break
      }
      case 'project': {
        const k = task.project_id ?? '__none__'
        keys = [k]
        labelMap.set(k, task.project_name ?? 'Без проекта')
        break
      }
      case 'assignee': {
        const a = assigneesMap[task.id] ?? []
        if (a.length === 0) {
          keys = ['__none__']
          labelMap.set('__none__', 'Без исполнителя')
        } else {
          keys = a.map((p) => {
            labelMap.set(p.id, `${p.name}${p.last_name ? ` ${p.last_name}` : ''}`)
            return p.id
          })
        }
        break
      }
      case 'deadline': {
        const label = formatDeadlineGroup(task.deadline)
        keys = [label]
        labelMap.set(label, label)
        break
      }
      default:
        keys = ['__all__']
        labelMap.set('__all__', '')
    }

    for (const k of keys) {
      const arr = map.get(k)
      if (arr) arr.push(task)
      else map.set(k, [task])
    }
  }

  const groups: TaskGroup[] = []
  for (const [key, groupTasks] of map) {
    groups.push({ key, label: labelMap.get(key) ?? key, tasks: groupTasks })
  }

  // Фиксированный порядок групп для дедлайнов
  if (groupBy === 'deadline') {
    const DEADLINE_ORDER = ['Просрочено', 'Сегодня', 'Завтра', 'На этой неделе', 'Позже', 'Без дедлайна']
    groups.sort((a, b) => {
      const ai = DEADLINE_ORDER.indexOf(a.label)
      const bi = DEADLINE_ORDER.indexOf(b.label)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }

  return groups
}
