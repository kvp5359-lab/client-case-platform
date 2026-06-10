"use client"

/**
 * useDeadlineFormat — читает настройку отображения сроков текущего воркспейса.
 *
 * Формат хранится в workspaces.deadline_near_format / deadline_far_format
 * (см. миграцию 20260610_workspace_deadline_display_format.sql) и приходит
 * на фронт через WorkspaceContext (useWorkspace делает select('*')).
 *
 * Возвращает { near, far } для передачи в formatDeadlineDisplay.
 */

import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import {
  DEFAULT_DEADLINE_NEAR_FORMAT,
  DEFAULT_DEADLINE_FAR_FORMAT,
  type DeadlineNearFormat,
  type DeadlineFarFormat,
} from '@/utils/deadlineUtils'

export function useDeadlineFormat(): {
  near: DeadlineNearFormat
  far: DeadlineFarFormat
} {
  const { workspace } = useWorkspaceContext()
  return {
    near: (workspace?.deadline_near_format as DeadlineNearFormat) ?? DEFAULT_DEADLINE_NEAR_FORMAT,
    far: (workspace?.deadline_far_format as DeadlineFarFormat) ?? DEFAULT_DEADLINE_FAR_FORMAT,
  }
}
