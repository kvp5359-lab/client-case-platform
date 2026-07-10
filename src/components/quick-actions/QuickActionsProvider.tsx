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
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { useQueueThreadInitialMessage } from '@/components/tasks/useQueueThreadInitialMessage'
import { globalOpenThread } from '@/components/tasks/TaskPanelContext'
import { newThreadToTaskItem } from '@/components/tasks/taskListConstants'
import { useParticipantsMutations } from '@/hooks/permissions/useParticipantsMutations'
import { CreateProjectDialog } from '@/components/projects/CreateProjectDialog'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import { ChatSettingsDialog, type ChatSettingsResult } from '@/components/messenger/ChatSettingsDialog'
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
  const queueInitialMessage = useQueueThreadInitialMessage(workspaceId ?? '')
  const { addMutation } = useParticipantsMutations(workspaceId)

  const [projectDialog, setProjectDialog] = useState<{
    open: boolean
    templateId: string | null
  }>({ open: false, templateId: null })
  const [contactDialog, setContactDialog] = useState<{
    open: boolean
    role: string | null
  }>({ open: false, role: null })
  const [threadDialog, setThreadDialog] = useState<{
    open: boolean
    template: ThreadTemplate | null
    targetProjectId: string | null
  }>({ open: false, template: null, targetProjectId: null })

  // Быстрое действие «Задача/Чат» открывает форму создания треда с предзаполненным
  // шаблоном и проектом — пользователь правит название/срок/исполнителя и подтверждает.
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
      const tpl = data as unknown as ThreadTemplate
      // Проект: явно заданный в быстром действии перебивает; иначе — «проект по
      // умолчанию» из самого шаблона (тут контекста проекта нет).
      setThreadDialog({
        open: true,
        template: tpl,
        targetProjectId: action.targetProjectId ?? tpl.default_project_id ?? null,
      })
    } catch (err) {
      toast.error('Не удалось загрузить шаблон треда', {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const handleCreateThread = (result: ChatSettingsResult) => {
    createThread.mutate(
      {
        name: result.name,
        description: result.description,
        accessType: result.accessType,
        accentColor: result.accentColor,
        icon: result.icon,
        type: result.channelType === 'email' ? 'email' : result.threadType,
        emailData:
          result.channelType === 'email'
            ? {
                contactEmails: (result.contactEmails ?? []).map((e) => e.email),
                subject: result.emailSubject,
              }
            : undefined,
        memberIds: result.memberIds,
        accessRoles: result.accessRoles,
        deadline: result.deadline,
        startAt: result.startAt,
        endAt: result.endAt,
        statusId: result.statusId,
        assigneeIds: result.assigneeIds,
        projectIdOverride: result.projectId !== undefined ? result.projectId : undefined,
        sourceTemplateId: result.sourceTemplateId,
      },
      {
        onSuccess: async (thread) => {
          // Единый механизм: отправка/черновик первого сообщения + открытие треда —
          // тот же путь, что у инбокса/досок/списков (иначе письмо не уходило).
          await queueInitialMessage(thread as ProjectThread, result)
          setThreadDialog({ open: false, template: null, targetProjectId: null })
          globalOpenThread(newThreadToTaskItem(thread as ProjectThread, result))
        },
        onError: (err) => {
          toast.error('Не удалось создать тред', {
            description: err instanceof Error ? err.message : String(err),
          })
        },
      },
    )
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
          if (workspaceId) router.push(`/workspaces/${workspaceId}/projects/${project.id}?tab=settings`)
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

      {threadDialog.template && (
        <ChatSettingsDialog
          chat={null}
          workspaceId={workspaceId}
          projectId={threadDialog.targetProjectId ?? undefined}
          defaultThreadType={threadDialog.template.thread_type}
          defaultTabMode={
            threadDialog.template.is_email ? 'email' : threadDialog.template.thread_type
          }
          initialTemplate={threadDialog.template}
          initialValues={
            threadDialog.targetProjectId
              ? { projectId: threadDialog.targetProjectId }
              : undefined
          }
          open={threadDialog.open}
          onOpenChange={(open) =>
            setThreadDialog((d) =>
              open
                ? { ...d, open }
                : { open: false, template: null, targetProjectId: null },
            )
          }
          onCreate={handleCreateThread}
          isPending={createThread.isPending}
        />
      )}
    </QuickActionsContext.Provider>
  )
}
