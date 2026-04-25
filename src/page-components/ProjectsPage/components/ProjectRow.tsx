import Link from 'next/link'
import { FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ParticipantAvatars, type AvatarParticipant } from '@/components/participants/ParticipantAvatars'
import { AssigneesPopover } from '@/components/tasks/AssigneesPopover'
import { ProjectStatusPopover } from '@/components/projects/ProjectStatusPopover'
import {
  getBadgeClasses,
  FOLDER_ICON_COLOR,
} from '@/components/WorkspaceSidebar/projectListConstants'
import { formatBadgeCount } from '@/utils/inboxUnread'
import type { Tables } from '@/types/database'

type Project = Tables<'projects'>

type BadgeDisplay =
  | { type: 'number'; value: number }
  | { type: 'emoji'; value: string }
  | { type: 'dot' }
  | { type: 'none' }

interface Props {
  project: Project
  workspaceId: string
  templateName: string | null
  participantGroups: { role: string; participants: AvatarParticipant[] }[]
  badge: BadgeDisplay
  badgeColor: string | undefined
  canEdit: boolean
  onToggleRoleParticipant: (args: {
    projectId: string
    participantId: string
    roleName: string
  }) => void
  onChangeStatus: (projectId: string, statusId: string) => void
  onDelete: (projectId: string, projectName: string) => void
}

export function ProjectRow({
  project,
  workspaceId,
  templateName,
  participantGroups,
  badge,
  badgeColor,
  canEdit,
  onToggleRoleParticipant,
  onChangeStatus,
  onDelete,
}: Props) {
  return (
    <div className="group/row relative flex items-center gap-3 px-3 py-2 border-b border-border/50 hover:bg-muted/30 transition-colors bg-background">
      <FolderOpen
        className="h-4 w-4 shrink-0"
        style={{ color: FOLDER_ICON_COLOR }}
      />
      <Link
        href={`/workspaces/${workspaceId}/projects/${project.id}?tab=settings`}
        className="flex items-center gap-2 min-w-0 text-left"
      >
        <span className="text-sm font-medium shrink-0">{project.name}</span>
        {templateName && (
          <span
            className="text-sm font-medium shrink-0 opacity-50"
            style={{ color: FOLDER_ICON_COLOR }}
          >
            · {templateName}
          </span>
        )}
        {project.description && (
          <span className="text-sm text-muted-foreground/60 truncate min-w-0">
            · {project.description}
          </span>
        )}
      </Link>

      <div className="flex items-center gap-2 shrink-0">
        {badge.type === 'number' && (
          <span
            className={cn(
              'min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-[11px] font-bold px-1 shrink-0',
              getBadgeClasses(badgeColor, false),
            )}
          >
            {formatBadgeCount(badge.value)}
          </span>
        )}
        {badge.type === 'emoji' && (
          <span
            className={cn(
              'inline-flex items-center justify-center w-[18px] h-[18px] rounded-full shrink-0',
              getBadgeClasses(badgeColor, false),
            )}
          >
            <span className="text-[10px] leading-none">{badge.value}</span>
          </span>
        )}
        {badge.type === 'dot' && (
          <span
            className={cn(
              'inline-block w-[18px] h-[18px] rounded-full shrink-0',
              getBadgeClasses(badgeColor, false),
            )}
          />
        )}
      </div>

      <div className="ml-auto flex items-center gap-3 shrink-0">
        {participantGroups.length > 0 && (
          <span className="flex items-center gap-0.5 shrink-0">
            {participantGroups.map((group, idx) => {
              const groupIds = new Set(group.participants.map((p) => p.id))
              return (
                <span key={group.role} className="flex items-center gap-0.5 shrink-0">
                  {idx > 0 && (
                    <span className="text-gray-300 text-[10px] shrink-0 leading-none">·</span>
                  )}
                  <AssigneesPopover
                    mode="controlled"
                    workspaceId={workspaceId}
                    assigneeIds={groupIds}
                    onToggle={(participantId) =>
                      onToggleRoleParticipant({
                        projectId: project.id,
                        participantId,
                        roleName: group.role,
                      })
                    }
                    align="end"
                    triggerOverride={
                      <button
                        type="button"
                        title={group.role}
                        className="flex items-center gap-1 shrink-0 rounded-md px-0.5 py-0.5 hover:bg-muted/50 transition-colors"
                      >
                        <ParticipantAvatars
                          participants={group.participants}
                          size="sm"
                          maxVisible={3}
                        />
                      </button>
                    }
                  />
                </span>
              )
            })}
          </span>
        )}
        <ProjectStatusPopover
          workspaceId={project.workspace_id}
          projectTemplateId={project.template_id}
          currentStatusId={project.status_id}
          onChange={(newStatusId) => onChangeStatus(project.id, newStatusId)}
          disabled={!canEdit}
        />
        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-[70px] text-right">
          {new Date(project.updated_at ?? '').toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
          })}
        </span>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="h-6 w-6 p-0 opacity-0 group-hover/row:opacity-100 data-[state=open]:opacity-100 transition-opacity flex items-center justify-center rounded hover:bg-muted shrink-0"
                aria-label="Меню проекта"
              >
                <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-600 focus:text-red-600 text-xs"
                onClick={() => onDelete(project.id, project.name)}
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
