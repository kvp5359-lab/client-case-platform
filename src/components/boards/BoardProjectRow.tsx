"use client"

import Link from 'next/link'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BoardProject } from './hooks/useWorkspaceProjects'
import type { DisplayMode, VisibleField } from './types'

interface BoardProjectRowProps {
  project: BoardProject
  workspaceId: string
  displayMode: DisplayMode
  visibleFields: VisibleField[]
}

export function BoardProjectRow({ project, workspaceId, displayMode, visibleFields }: BoardProjectRowProps) {
  const href = `/workspaces/${workspaceId}/projects/${project.id}`
  const showTemplate = visibleFields.includes('template')

  if (displayMode === 'cards') {
    return (
      <Link
        href={href}
        className="rounded-md border bg-background px-2 py-1 hover:shadow-sm transition-shadow cursor-pointer overflow-hidden block"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="text-[14px] truncate leading-snug">{project.name}</span>
          {showTemplate && project.template_name && (
            <span className="text-[12px] text-muted-foreground/60 truncate shrink-0">{project.template_name}</span>
          )}
        </div>
      </Link>
    )
  }

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-accent/50 transition-colors cursor-pointer',
      )}
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-[14px] truncate">{project.name}</span>
      {showTemplate && project.template_name && (
        <span className="text-[13px] text-muted-foreground/60 truncate shrink-0">{project.template_name}</span>
      )}
    </Link>
  )
}
