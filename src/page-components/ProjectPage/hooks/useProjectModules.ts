"use client"

/**
 * Хук для определения доступных модулей проекта
 *
 * Использует PROJECT_MODULES реестр — вся конфигурация модулей в одном месте.
 * Возвращает:
 * - availableModules: отфильтрованный список доступных модулей
 * - isModuleEnabled(id): проверка доступности конкретного модуля
 * - getFirstAvailableTab(): id первой доступной вкладки
 * - modules: объект {settings: true, forms: false, ...} для обратной совместимости
 */

import { useCallback, useMemo } from 'react'
import { useProjectPermissions, useWorkspaceFeatures } from '@/hooks/permissions'
import { PROJECT_MODULES, type ModuleDefinition } from '../moduleRegistry'
import type { ProjectTemplate } from '../types'

export function useProjectModules(
  projectId: string | undefined,
  workspaceId: string | undefined,
  projectTemplate: ProjectTemplate | null | undefined,
) {
  const { hasModuleAccess, isLoading, moduleAccess } = useProjectPermissions({
    projectId: projectId || '',
  })
  const { isEnabled: isFeatureEnabled } = useWorkspaceFeatures({ workspaceId: workspaceId || '' })

  const enabledModules = projectTemplate?.enabled_modules || []

  // Доступные модули — отсортированные по order
  const availableModules = useMemo(
    () => {
      const isModuleAccessible = (mod: ModuleDefinition): boolean => {
        if (mod.templateKey && !enabledModules.includes(mod.templateKey)) return false
        if (mod.permissionKey && !hasModuleAccess(mod.permissionKey)) return false
        if (mod.featureKey && !isFeatureEnabled(mod.featureKey)) return false
        return true
      }
      return PROJECT_MODULES.filter(isModuleAccessible).sort((a, b) => a.order - b.order)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- .join(',') стабилизация массива
    [enabledModules.join(','), projectId, workspaceId, moduleAccess],
  )

  // Быстрая проверка по id
  const isModuleEnabled = useCallback(
    (id: string): boolean => availableModules.some((m) => m.id === id),
    [availableModules],
  )

  // Первая доступная вкладка
  const getFirstAvailableTab = useCallback((): string => {
    const firstTab = availableModules.find((m) => m.showTab !== false)
    return firstTab?.id || 'settings'
  }, [availableModules])

  // Обратная совместимость: объект modules для кода, который ещё не переведён
  const modules = useMemo(
    () => {
      const has = (id: string) => availableModules.some((m) => m.id === id)
      return {
        settings: has('settings'),
        forms: has('forms'),
        documents: has('documents'),
        finances: has('finances'),
        tasks: has('tasks'),
        history: has('history'),
        participants: has('settings'), // участники — вкладка в settings, не отдельный модуль
        // ai-chat не в реестре: доступ = ИЛИ трёх permission keys + feature gate,
        // формат ModuleDefinition поддерживает только один permissionKey
        aiChat:
          enabledModules.includes('ai_chat') &&
          (hasModuleAccess('ai_knowledge_all') ||
            hasModuleAccess('ai_knowledge_project') ||
            hasModuleAccess('ai_project_assistant')) &&
          isFeatureEnabled('ai_chat_assistant'),
        knowledgeBase: has('knowledge-base'),
        messenger: has('messenger'),
        internalMessenger: has('internal-messenger'),
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- .join(',') стабилизация массива
    [availableModules, enabledModules.join(','), moduleAccess],
  )

  return {
    availableModules,
    isModuleEnabled,
    getFirstAvailableTab,
    modules,
    isLoading,
  }
}
