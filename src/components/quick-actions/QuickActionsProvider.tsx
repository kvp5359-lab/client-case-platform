"use client"

/**
 * Провайдер исполнения быстрых действий («+»).
 * Один экземпляр на сайдбар: монтирует диалоги (новый проект / контакт) и держит
 * раннер. И меню «+», и отдельные кнопки-слоты `quickaction` зовут один `run`.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useCreateThread } from '@/hooks/messenger/useProjectThreads.mutations'
import { useParticipantsMutations } from '@/hooks/permissions/useParticipantsMutations'
import { applyTemplate } from '@/hooks/messenger/useThreadTemplates'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import type { Participant } from '@/types/entities'
import type { ThreadTemplate } from '@/types/threadTemplate'
import type { QuickAction } from '@/types/quickActions'

type QuickActionsContextValue = {
  run: (action: QuickAction) => void
}

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null)

/** Раннер быстрых действий. Возвращает no-op, если провайдер не смонтирован. */
export function useQuickActionsRunner(): QuickActionsContextValue {
  return useContext(QuickActionsContext) ?? { run: () => {} }
}

export function QuickActionsProvider({
  workspaceId,
  children,
}: {
  workspaceId: string | undefined
  children: ReactNode
}) {
  const router = useRouter()
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
    <QuickActionsContext.Provider value={{ run }}>
      {children}

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
    </QuickActionsContext.Provider>
  )
}
