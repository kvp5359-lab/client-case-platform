"use client"

import { useCallback, lazy } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidePanelStore } from '@/store/sidePanelStore'
import type { ChatSettingsResult } from '@/components/messenger/chatSettingsTypes'
import { useCreateThread, useUpdateThread } from '@/hooks/messenger/useProjectThreads'
import type { ProjectThread, ThreadAccentColor } from '@/hooks/messenger/useProjectThreads'
import type { ThreadTemplate } from '@/types/threadTemplate'
import { getCurrentWorkspaceParticipant } from '@/services/api/messenger/messengerService'

// Lazy-load ChatSettingsDialog: он тянет Tiptap через ComposeField (~200 KB).
// Диалог нужен только при создании/редактировании чата — грузим по требованию.
const ChatSettingsDialog = lazy(() =>
  import('@/components/messenger/ChatSettingsDialog').then((m) => ({
    default: m.ChatSettingsDialog,
  })),
)

interface ChatSettingsSectionProps {
  projectId: string
  workspaceId: string
  settingsChat: ProjectThread | null | undefined
  settingsOpen: boolean
  defaultTab?: 'task' | 'chat' | 'email'
  initialTemplate?: ThreadTemplate | null
  onClose: () => void
  onCreated: (chat: ProjectThread, result?: ChatSettingsResult) => void
}

export function ChatSettingsSection({
  projectId,
  workspaceId,
  settingsChat,
  settingsOpen,
  defaultTab,
  initialTemplate,
  onClose,
  onCreated,
}: ChatSettingsSectionProps) {
  const { user } = useAuth()
  const createChatMutation = useCreateThread(projectId, workspaceId)
  const updateChatMutation = useUpdateThread()
  const setPendingInitialMessage = useSidePanelStore((s) => s.setPendingInitialMessage)

  const handleCreateChat = useCallback(
    async (result: ChatSettingsResult) => {
      let senderName = 'Вы'
      if (result.initialMessage && user) {
        try {
          const p = await getCurrentWorkspaceParticipant(workspaceId, user.id)
          if (p) senderName = p.name
        } catch {
          /* fallback */
        }
      }

      createChatMutation.mutate(
        {
          name: result.name,
          accessType: result.accessType,
          accentColor: result.accentColor,
          icon: result.icon,
          type: result.threadType,
          emailData:
            result.channelType === 'email' && result.contactEmails?.length
              ? {
                  contactEmails: result.contactEmails.map((e) => e.email),
                  subject: result.emailSubject,
                }
              : undefined,
          memberIds: result.memberIds,
          accessRoles: result.accessRoles,
          deadline: result.deadline,
          statusId: result.statusId,
          assigneeIds: result.assigneeIds,
          projectIdOverride: result.projectId !== undefined ? result.projectId : undefined,
          sourceTemplateId: result.sourceTemplateId,
        },
        {
          onSuccess: (newChat) => {
            if (result.initialMessage) {
              setPendingInitialMessage({
                threadId: newChat.id,
                html: result.initialMessage.html,
                files: result.initialMessage.files,
                isEmail: result.channelType === 'email',
                senderName,
              })
            }
            onCreated(newChat, result)
          },
        },
      )
    },
    [createChatMutation, onCreated, workspaceId, user, setPendingInitialMessage],
  )

  const handleEditSave = useCallback(
    (params: { name: string; accent_color: ThreadAccentColor; icon: string }) => {
      if (!settingsChat) return
      updateChatMutation.mutate(
        { threadId: settingsChat.id, projectId, ...params },
        { onSuccess: () => onClose() },
      )
    },
    [settingsChat, updateChatMutation, projectId, onClose],
  )

  return (
    <ChatSettingsDialog
      chat={settingsChat ?? null}
      projectId={projectId}
      workspaceId={workspaceId}
      defaultThreadType={defaultTab === 'task' ? 'task' : 'chat'}
      defaultTabMode={defaultTab}
      initialTemplate={initialTemplate}
      open={settingsOpen}
      onOpenChange={(v) => {
        if (!v) onClose()
      }}
      onCreate={handleCreateChat}
      onUpdate={handleEditSave}
      isPending={createChatMutation.isPending || updateChatMutation.isPending}
    />
  )
}
