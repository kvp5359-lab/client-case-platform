"use client"

import { useMemo } from 'react'
import { useProjectPermissions, useWorkspacePermissions } from '@/hooks/permissions'
import type { TaskPanelTabType } from './taskPanelTabs.types'

/**
 * Видимость системных вкладок по правам пользователя.
 *
 * Возвращает Set типов системных вкладок, которые user может открывать.
 * Используется и для фильтрации [+] меню (нет смысла предлагать), и для
 * фильтрации UI бейджей (если user потерял доступ — не показываем вкладку).
 */
export function usePanelTabsVisibility(
  workspaceId: string,
  projectId: string | null,
): Set<TaskPanelTabType> {
  const { hasModuleAccess } = useProjectPermissions({ projectId: projectId || '' })
  const { isClientOnly } = useWorkspacePermissions({ workspaceId: workspaceId || '' })
  return useMemo(() => {
    const set = new Set<TaskPanelTabType>()
    if (projectId) {
      if (hasModuleAccess('tasks')) set.add('tasks')
      if (hasModuleAccess('history')) set.add('history')
      if (hasModuleAccess('documents')) set.add('documents')
      if (hasModuleAccess('forms')) set.add('forms')
      if (hasModuleAccess('knowledge_base')) set.add('materials')
      if (!isClientOnly) set.add('extra')
    }
    if (
      !projectId ||
      hasModuleAccess('ai_knowledge_all') ||
      hasModuleAccess('ai_knowledge_project') ||
      hasModuleAccess('ai_project_assistant')
    ) {
      set.add('assistant')
    }
    // 'thread' — отдельные треды, видимость определяется RLS / openThreadTab.
    return set
  }, [projectId, hasModuleAccess, isClientOnly])
}
