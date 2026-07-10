"use client"

/**
 * SectionGuard — гейт доступа к разделу воркспейса по праву роли.
 * Если у пользователя нет права — редирект на главную воркспейса.
 * Пока права грузятся — ничего не показываем (без мигания контента).
 */

import { useEffect, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useWorkspacePermissions } from '@/hooks/permissions'
import type { WorkspacePermission } from '@/types/permissions'

export function SectionGuard({
  permission,
  children,
}: {
  permission: WorkspacePermission
  children: ReactNode
}) {
  const router = useRouter()
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const { isLoading, can } = useWorkspacePermissions({ workspaceId })

  const allowed = can(permission)

  useEffect(() => {
    if (!isLoading && !allowed && workspaceId) {
      router.replace(`/workspaces/${workspaceId}`)
    }
  }, [isLoading, allowed, workspaceId, router])

  if (isLoading || !allowed) return null

  return <>{children}</>
}
