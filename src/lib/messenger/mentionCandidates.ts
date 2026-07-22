/**
 * Чистая логика списка кандидатов для @-упоминаний (тестируется без React).
 *
 * Кандидаты = связанные с задачей (участники проекта ∪ участники задачи ∪
 * исполнители) ∪ — только в тредах ПРОЕКТА — все сотрудники воркспейса
 * (решение владельца 2026-07-22). Упоминание сотрудника без доступа
 * автоматически добавляет его участником задачи (БД-триггер
 * trg_mention_recompute, миграции 20260722190000/20260722200000), поэтому
 * «отметили в пустоту» не бывает. В личных диалогах (без project_id)
 * общий список НЕ показываем — иначе упоминание раздавало бы коллегам
 * доступ к личной переписке с клиентом.
 *
 * Только с аккаунтом (user_id) — telegram-контакты не видят ЛК. Сотрудник =
 * workspace-роль из isStaffRole (клиенты и роли вне канона в общий список не
 * попадают — им триггер доступ и не выдаст; связанные с задачей показываются
 * как раньше, включая клиентов-участников проекта). Себя исключаем.
 * Порядок: связанные с задачей, затем остальные сотрудники; внутри — алфавит.
 */
import { isStaffRole } from '@/types/permissions'

export type MentionCandidate = {
  id: string
  user_id: string | null
  name: string
  last_name: string | null
  avatar_url: string | null
  workspace_roles: string[] | null
  can_login: boolean
}

export type MentionGroup = 'related' | 'staff'

export type MentionItem = {
  id: string
  label: string
  avatarUrl: string | null
  group: MentionGroup
}

export function buildMentionItems(params: {
  participants: MentionCandidate[]
  relatedIds: ReadonlySet<string>
  currentUserId: string | undefined
  /** true только для тредов проекта — в личных диалогах общий список скрыт. */
  includeWorkspaceStaff: boolean
}): MentionItem[] {
  const { participants, relatedIds, currentUserId, includeWorkspaceStaff } = params
  const toItem = (p: MentionCandidate, group: MentionGroup): MentionItem => ({
    id: p.id,
    label: [p.name, p.last_name].filter(Boolean).join(' '),
    avatarUrl: p.avatar_url,
    group,
  })
  const byLabel = (a: MentionItem, b: MentionItem) => a.label.localeCompare(b.label, 'ru')
  const candidates = participants.filter((p) => p.user_id && p.user_id !== currentUserId)

  // Связанные с задачей — как раньше (включая клиентов-участников проекта).
  const related = candidates
    .filter((p) => relatedIds.has(p.id))
    .map((p) => toItem(p, 'related'))
    .sort(byLabel)

  if (!includeWorkspaceStaff) return related

  // Остальные сотрудники воркспейса — триггер выдаст им доступ при упоминании.
  const staff = candidates
    .filter(
      (p) =>
        !relatedIds.has(p.id) &&
        p.can_login &&
        (p.workspace_roles ?? []).some((r) => isStaffRole(r)),
    )
    .map((p) => toItem(p, 'staff'))
    .sort(byLabel)

  return [...related, ...staff]
}
