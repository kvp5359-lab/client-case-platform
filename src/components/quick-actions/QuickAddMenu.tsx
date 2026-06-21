"use client"

/**
 * Универсальная кнопка «+» с настраиваемым меню быстрых действий.
 * Читает quick_actions активного «Профиля настроек», по клику исполняет действие:
 * создать проект / тред из шаблона / контакт / открыть раздел.
 *
 * Действия настраиваются в Настройки → Сайдбар (редактор профиля).
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Settings2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/lib/supabase'
import { useActiveInterfacePreset } from '@/hooks/useInterfacePresets'
import { useCreateThread } from '@/hooks/messenger/useProjectThreads.mutations'
import { useParticipantsMutations } from '@/hooks/permissions/useParticipantsMutations'
import { applyTemplate } from '@/hooks/messenger/useThreadTemplates'
import { getChatIconComponent } from '@/components/messenger/chatVisuals'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import type { Participant } from '@/types/entities'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { QuickAction } from '@/types/quickActions'

export function QuickAddMenu({
  workspaceId,
  compact,
}: {
  workspaceId: string | undefined
  compact?: boolean
}) {
  const router = useRouter()
  const { quickActions } = useActiveInterfacePreset(workspaceId)
  const createThread = useCreateThread(null, workspaceId ?? '')
  const { addMutation } = useParticipantsMutations(workspaceId)

  const [projectDialog, setProjectDialog] = useState<{
    open: boolean
    templateId: string | null
  }>({ open: false, templateId: null })
  const [contactDialog, setContactDialog] = useState<{
    open: boolean
    role: string | null
  }>({ open: false, role: null })

  const runNewThread = async (action: QuickAction) => {
    if (!workspaceId || !action.threadTemplateId) {
      toast.error('У действия не выбран шаблон треда')
      return
    }
    try {
      const { data, error } = await supabase
        .from('thread_templates')
        .select('*, thread_template_assignees(participant_id)')
        .eq('id', action.threadTemplateId)
        .maybeSingle()
      if (error) throw error
      if (!data) {
        toast.error('Шаблон треда не найден')
        return
      }
      const template = data as unknown as ThreadTemplate
      const applied = applyTemplate(template, {
        projectParticipantIds: new Set<string>(),
        allParticipants: [],
        taskStatusIds: new Set<string>(),
      })
      const thread = await createThread.mutateAsync({
        name: applied.name,
        accessType: applied.accessType,
        accentColor: applied.accentColor,
        icon: applied.icon,
        type: applied.tabMode,
        accessRoles: applied.accessRoles,
        deadline: applied.taskDeadline ? applied.taskDeadline.toISOString() : null,
        statusId: applied.taskStatusId,
        assigneeIds: applied.taskAssigneeIds,
        projectIdOverride: action.targetProjectId ?? null,
        sourceTemplateId: template.id,
        emailData:
          applied.channelType === 'email'
            ? { contactEmails: applied.contactEmails, subject: applied.emailSubject }
            : undefined,
      })
      toast.success(`Создан тред «${thread.name}»`)
    } catch (err) {
      toast.error('Не удалось создать тред', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const run = (action: QuickAction) => {
    switch (action.kind) {
      case 'new_project':
        setProjectDialog({ open: true, templateId: action.projectTemplateId ?? null })
        break
      case 'new_contact':
        setContactDialog({ open: true, role: action.defaultRole ?? null })
        break
      case 'open_route':
        if (workspaceId && action.route) {
          router.push(`/workspaces/${workspaceId}/${action.route.replace(/^\/+/, '')}`)
        }
        break
      case 'new_thread':
        void runNewThread(action)
        break
    }
  }

  const handleAddContact = async (data: Partial<Participant>) => {
    await addMutation.mutateAsync(data)
    setContactDialog({ open: false, role: null })
    toast.success('Контакт создан')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Быстрое добавление"
            className={`flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors ${
              compact ? 'h-9 w-9' : 'h-9 w-full gap-1.5 text-sm'
            }`}
          >
            <Plus className="h-4 w-4" />
            {!compact && 'Создать'}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {quickActions.length === 0 ? (
            <div className="px-2 py-3 text-xs text-gray-500">
              Быстрых действий пока нет. Настрой их в профиле.
            </div>
          ) : (
            <>
              <DropdownMenuLabel className="text-xs text-gray-500 font-normal">
                Быстрое добавление
              </DropdownMenuLabel>
              {quickActions.map((action) => {
                const Icon = getChatIconComponent(action.icon)
                return (
                  <DropdownMenuItem
                    key={action.id}
                    className="cursor-pointer"
                    onClick={() => run(action)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-gray-500" />
                    {action.label}
                  </DropdownMenuItem>
                )
              })}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="cursor-pointer text-gray-600"
            onClick={() =>
              workspaceId && router.push(`/workspaces/${workspaceId}/settings/sidebar`)
            }
          >
            <Settings2 className="mr-2 h-4 w-4" />
            Настроить действия
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateProjectDialog
        open={projectDialog.open}
        onOpenChange={(open) => setProjectDialog((p) => ({ ...p, open }))}
        defaultTemplateId={projectDialog.templateId}
        onSuccess={(project) => {
          setProjectDialog({ open: false, templateId: null })
          if (workspaceId) router.push(`/workspaces/${workspaceId}/projects/${project.id}`)
        }}
      />

      <EditParticipantDialog
        participant={null}
        open={contactDialog.open}
        onOpenChange={(open) => setContactDialog((c) => ({ ...c, open }))}
        onSave={handleAddContact}
        isLoading={addMutation.isPending}
        defaultRole={contactDialog.role ?? undefined}
      />
    </>
  )
}
