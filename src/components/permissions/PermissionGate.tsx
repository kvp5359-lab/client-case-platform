"use client"

/**
 * PermissionGate — компонент для условного рендеринга на основе прав доступа
 *
 * Позволяет скрывать/показывать элементы UI в зависимости от разрешений пользователя
 */

import { ReactNode } from 'react'
import { useWorkspaceFeatures } from '../../hooks/permissions'
import type { WorkspaceFeature } from '../../types/permissions'

// =====================================================
// FeatureGate
// =====================================================

interface FeatureGateProps {
  /** Фича для проверки */
  feature: WorkspaceFeature
  /** ID workspace (опционально, берётся из store) */
  workspaceId?: string
  /** Контент при включённой фиче */
  children: ReactNode
  /** Контент при выключенной фиче */
  fallback?: ReactNode
  /** Показывать ли загрузку */
  showLoading?: boolean
}

/**
 * Показывает children только если фича включена в workspace
 */
export function FeatureGate({
  feature,
  workspaceId,
  children,
  fallback = null,
  showLoading = false,
}: FeatureGateProps) {
  const { isEnabled, isLoading } = useWorkspaceFeatures({ workspaceId })

  if (isLoading && showLoading) {
    return <span className="animate-pulse bg-muted h-4 w-16 rounded" />
  }

  if (isLoading) {
    return null
  }

  if (!isEnabled(feature)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
