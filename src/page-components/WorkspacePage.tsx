"use client"

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { useWorkspaceContext } from '@/contexts/WorkspaceContext'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { useClientWorkspaceProjects } from '@/hooks/useClientWorkspaceProjects'

export function WorkspacePage() {
  const { workspace, isLoading, error } = useWorkspaceContext()
  usePageTitle(workspace?.name)

  const router = useRouter()
  const { isClientOnly, isLoading: permsLoading } = useWorkspacePermissions({
    workspaceId: workspace?.id ?? '',
  })
  const { data: clientProjects = [], isLoading: projectsLoading } = useClientWorkspaceProjects(
    isClientOnly ? workspace?.id : undefined,
  )

  useEffect(() => {
    if (!workspace || permsLoading || !isClientOnly || projectsLoading) return
    if (clientProjects.length > 0) {
      router.replace(`/workspaces/${workspace.id}/projects/${clientProjects[0].id}`)
    }
  }, [workspace, permsLoading, isClientOnly, projectsLoading, clientProjects, router])

  return (
    <WorkspaceLayout>
      <main className="flex-1 p-8 overflow-auto">
        {isLoading ? (
          <p className="text-gray-500 text-lg">Загрузка...</p>
        ) : error ? (
          <p className="text-red-500 text-lg">{error.message}</p>
        ) : workspace ? (
          isClientOnly ? (
            <p className="text-gray-500 text-lg">Загрузка...</p>
          ) : (
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-4">{workspace.name}</h1>
              <p className="text-gray-600">Добро пожаловать в рабочее пространство</p>
            </div>
          )
        ) : (
          <p className="text-gray-500 text-lg">Рабочее пространство не найдено</p>
        )}
      </main>
    </WorkspaceLayout>
  )
}
