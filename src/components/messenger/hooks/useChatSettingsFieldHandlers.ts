import { useCallback } from 'react'
import { projectThreadKeys } from '@/hooks/queryKeys'
import type { AccessType } from '../chatSettingsTypes'
import type { useChatSettingsFormState } from './useChatSettingsFormState'
import type { useChatSettingsMutations } from './useChatSettingsMutations'

type FormReturn = ReturnType<typeof useChatSettingsFormState>
type Mutations = ReturnType<typeof useChatSettingsMutations>

/**
 * Тонкие обработчики полей настроек чата (доступ, участник, проект, статус,
 * дедлайн). В edit-режиме сразу дёргают мутацию, в create-режиме пишут в форму.
 * Вынесено из useChatSettingsActions (аудит 2026-07-13) — логика не менялась.
 */
export function useChatSettingsFieldHandlers(args: {
  form: FormReturn
  mutations: Mutations
  memberIds: Set<string>
  chatId: string | undefined
}) {
  const { form, mutations, memberIds, chatId } = args
  const {
    updateAccessMutation,
    updateStatusMutation,
    updateDeadlineMutation,
    updateProjectMutation,
    toggleMemberMutation,
    queryClient,
  } = mutations

  const handleAccessChange = useCallback(
    (newAccess: AccessType, roles?: string[]) => {
      form.setAccessType(newAccess)
      if (form.isEditMode) updateAccessMutation.mutate({ accessType: newAccess, roles })
    },
    [form, updateAccessMutation],
  )

  const handleToggleMember = useCallback(
    (participantId: string) => {
      const isMember = memberIds.has(participantId)
      toggleMemberMutation.mutate({ participantId, add: !isMember })
      queryClient.setQueryData(projectThreadKeys.members(chatId), (old: Set<string> | undefined) => {
        const next = new Set(old ?? [])
        if (isMember) next.delete(participantId)
        else next.add(participantId)
        return next
      })
    },
    [memberIds, toggleMemberMutation, chatId, queryClient],
  )

  const handleProjectSelect = useCallback(
    (projectId: string | null) => {
      form.setSelectedProjectId(projectId)
      if (form.isEditMode) updateProjectMutation.mutate(projectId)
    },
    [form, updateProjectMutation],
  )

  const handleStatusSelect = useCallback(
    (sid: string) => {
      if (form.isEditMode) {
        form.setLocalStatusId(sid)
        updateStatusMutation.mutate(sid)
      } else {
        form.setTaskStatusId(sid)
      }
      form.setStatusPopoverOpen(false)
    },
    [form, updateStatusMutation],
  )

  const handleDeadlineSelect = useCallback(
    (date: Date | undefined) => {
      if (!date) return
      if (form.isEditMode) {
        const iso = date.toISOString()
        form.setLocalDeadline(iso)
        updateDeadlineMutation.mutate(iso)
      } else {
        form.setTaskDeadline(date)
      }
    },
    [form, updateDeadlineMutation],
  )

  const handleDeadlineClear = useCallback(() => {
    if (form.isEditMode) {
      form.setLocalDeadline(null)
      updateDeadlineMutation.mutate(null)
    } else {
      form.setTaskDeadline(undefined)
    }
  }, [form, updateDeadlineMutation])

  return {
    handleAccessChange,
    handleToggleMember,
    handleProjectSelect,
    handleStatusSelect,
    handleDeadlineSelect,
    handleDeadlineClear,
  }
}
