"use client"

/**
 * WorkspaceLayout — упрощённая версия с sidebar
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  WorkspacePicker,
  ProjectsList,
  UserProfile,
  useSidebarData,
  useSidebarResize,
} from './WorkspaceSidebar'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  workspaceId?: string
}

export function WorkspaceLayout({ children, workspaceId: propWorkspaceId }: WorkspaceLayoutProps) {
  const params = useParams<{ workspaceId?: string }>()
  const router = useRouter()
  const { user } = useAuth()
  const workspaceId = propWorkspaceId || params.workspaceId || ''

  const [mobileOpen, setMobileOpen] = useState(false)
  const { width, onMouseDown } = useSidebarResize()
  const {
    workspaces,
    projects,
    loadingWorkspaces,
    loadingProjects,
    currentWorkspace,
    permissionsResult,
  } = useSidebarData({ workspaceId })

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isOwner = currentWorkspace?.participant?.role === 'owner'
  const canManageSettings = permissionsResult?.can?.('manage_settings') ?? isOwner

  return (
    <div className="flex h-screen bg-background">
      {/* Мобильная кнопка меню */}
      <button
        className="fixed top-3 left-3 z-50 md:hidden p-2 rounded-md bg-background border"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col h-full',
          'fixed inset-y-0 left-0 z-40 md:relative md:z-auto',
          'transition-transform duration-200 md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{ width }}
      >
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          <WorkspacePicker
            workspaces={workspaces}
            currentWorkspace={currentWorkspace}
            workspaceId={workspaceId}
            loadingWorkspaces={loadingWorkspaces}
            isOwner={isOwner}
            canManageSettings={canManageSettings}
          />
          <ProjectsList
            projects={projects}
            loading={loadingProjects}
            onProjectClick={(projectId) =>
              router.push(`/workspaces/${workspaceId}/projects/${projectId}`)
            }
            getProjectHref={(projectId) =>
              `/workspaces/${workspaceId}/projects/${projectId}`
            }
          />
        </div>
        {user && (
          <div className="border-t border-sidebar-border p-2">
            <UserProfile
              user={user}
              onProfileClick={() => router.push('/profile')}
              onSignOut={handleSignOut}
            />
          </div>
        )}

        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20"
          onMouseDown={onMouseDown}
        />
      </aside>

      {/* Overlay для мобильных */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  )
}
