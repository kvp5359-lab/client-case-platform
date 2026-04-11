/**
 * Инициализация значений по умолчанию для диалога создания чата/задачи:
 *   - default task status (первый `is_default` из списка статусов)
 *   - default assignee (текущий пользователь, если он есть в проекте)
 *
 * Вынесено из useChatSettingsActions.ts (аудит 2026-04-11, Зона 6).
 * Важно: использует синхронную установку (без useEffect), потому что
 * срабатывать должно в первом же рендере, где данные готовы — чтобы UI
 * не мигал старым значением.
 */

import type { useChatSettingsFormState } from './useChatSettingsFormState'

type FormReturn = ReturnType<typeof useChatSettingsFormState>

/** Минимальный набор полей, который нужен для установки default-значений. */
interface TaskStatusLike {
  id: string
  is_default: boolean | null
}

interface DefaultParticipant {
  id: string
  user_id?: string | null
}

interface UseChatSettingsDefaultsParams {
  form: FormReturn
  taskStatuses: TaskStatusLike[]
  effectiveParticipants: DefaultParticipant[]
  userId?: string
}

/**
 * Хук не возвращает значений — он синхронно дёргает `form.set*` при первом
 * рендере, где есть данные. Паттерн повторяет оригинал из useChatSettingsActions,
 * но вынесен в отдельный файл для читаемости.
 */
export function useChatSettingsDefaults({
  form,
  taskStatuses,
  effectiveParticipants,
  userId,
}: UseChatSettingsDefaultsParams) {
  // Default status for tasks (create mode)
  if (!form.isEditMode && form.isTask && !form.defaultsApplied && taskStatuses.length > 0) {
    const def = taskStatuses.find((s) => s.is_default) ?? taskStatuses[0]
    if (def && !form.taskStatusId) form.setTaskStatusId(def.id)
    form.setDefaultsApplied(true)
  }

  // Default assignee — current user (create task mode)
  if (
    !form.isEditMode &&
    form.isTask &&
    !form.assigneeDefaultApplied &&
    effectiveParticipants.length > 0 &&
    userId
  ) {
    const me = effectiveParticipants.find((p) => p.user_id === userId)
    if (me) {
      form.setTaskAssignees(new Set([me.id]))
      form.setAssigneeDefaultApplied(true)
    }
  }
}
