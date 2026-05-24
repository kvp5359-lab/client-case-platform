import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'
import type { AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import type { StatusOption } from '@/components/ui/status-dropdown'
import type { GroupByField } from './types'

// ── Форматирование дедлайна (re-export из общего модуля) ────
export { formatDeadline, isOverdue, formatDeadlineGroup } from '@/utils/deadlineUtils'
import { formatDeadlineGroup } from '@/utils/deadlineUtils'

// ── Форматирование интервала времени (start_at—end_at) ─────
//
// Используется полем «Время» в карточке задачи. В отличие от `deadline`,
// которое показывает дату («Сегодня», «15 апр»), это поле выводит только
// часы:минуты — компактный интервал слота из календаря.
//
// • start_at + end_at в один день → 'HH:MM–HH:MM'
// • start_at + end_at в разные дни → 'HH:MM–HH:MM' (всё равно только часы,
//   дату пользователь видит в колонке/группировке)
// • только start_at → 'HH:MM'
// • только end_at  → 'до HH:MM'
// • ничего → null
export function formatTimeRange(
  startAt: string | null,
  endAt: string | null,
): string | null {
  const fmt = (iso: string) => {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (startAt && endAt) return `${fmt(startAt)}–${fmt(endAt)}`
  if (startAt) return fmt(startAt)
  if (endAt) return `до ${fmt(endAt)}`
  return null
}

// ── Группировка ─────────────────────────────────────────

export type TaskGroup = {
  key: string
  label: string
  tasks: WorkspaceTask[]
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

// ── Группировка проектов ────────────────────────────────────
//
// Группировка списков «Проекты» поддерживает только 'status' (см.
// PROJECT_GROUP_BY_OPTIONS). Для других значений возвращается одна группа.

export type ProjectGroup<T> = {
  key: string
  label: string
  color: string | null
  projects: T[]
}

export function groupProjects<T extends { id: string; status_id: string | null }>(
  projects: T[],
  groupBy: GroupByField,
  statuses: StatusOption[],
): ProjectGroup<T>[] {
  if (groupBy !== 'status') {
    return [{ key: '__all__', label: '', color: null, projects }]
  }

  const map = new Map<string, T[]>()
  const labelMap = new Map<string, string>()
  const colorMap = new Map<string, string | null>()

  for (const project of projects) {
    const k = project.status_id ?? '__none__'
    if (!labelMap.has(k)) {
      const s = statuses.find((s) => s.id === project.status_id)
      labelMap.set(k, s?.name ?? 'Без статуса')
      colorMap.set(k, s?.color ?? null)
    }
    const arr = map.get(k)
    if (arr) arr.push(project)
    else map.set(k, [project])
  }

  // Порядок групп: по order_index статусов из справочника, затем «Без статуса» в конец.
  const result: ProjectGroup<T>[] = []
  for (const s of statuses) {
    const list = map.get(s.id)
    if (list) {
      result.push({ key: s.id, label: s.name, color: s.color, projects: list })
    }
  }
  if (map.has('__none__')) {
    result.push({
      key: '__none__',
      label: 'Без статуса',
      color: null,
      projects: map.get('__none__')!,
    })
  }
  return result
}
