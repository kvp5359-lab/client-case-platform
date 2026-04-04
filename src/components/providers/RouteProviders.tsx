/**
 * RouteProviders — обертки провайдеров для роутинга
 * Предоставляют контексты на основе URL параметров
 */

import { ReactNode } from 'react'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { ProjectProvider } from '@/contexts/ProjectContext'

/**
 * Обертка для роутов с workspaceId
 */
export function WithWorkspace({ children }: { children: ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>
}

/**
 * Обертка для роутов с projectId
 * Автоматически включает WorkspaceProvider
 */
export function WithProject({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <ProjectProvider>{children}</ProjectProvider>
    </WorkspaceProvider>
  )
}
