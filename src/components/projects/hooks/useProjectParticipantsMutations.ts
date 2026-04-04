"use client"

/**
 * Хук мутаций участников проекта: добавление/удаление ролей, создание участника
 */

import { useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { logger } from '@/utils/logger'
import { toast } from 'sonner'
import type { Participant } from '@/types/entities'
import type { ParticipantWithUser } from './useProjectParticipantsData'

/**
 * Выдаёт доступ к брифам (Google Sheets) для указанных участников проекта.
 * Вызывается в фоне после добавления участников — не блокирует UI.
 */
async function shareBriefsWithParticipants(
  projectId: string,
  workspaceId: string,
  participantIds: string[],
  participants: Participant[],
) {
  try {
    // 1. Найти все brief_sheet_id для этого проекта
    const { data: formKits } = await supabase
      .from('form_kits')
      .select('brief_sheet_id')
      .eq('project_id', projectId)
      .not('brief_sheet_id', 'is', null)

    if (!formKits || formKits.length === 0) return

    // 2. Собрать email'ы новых участников
    const emails = participantIds
      .map((id) => participants.find((p) => p.id === id)?.email)
      .filter((e): e is string => !!e)

    if (emails.length === 0) return

    // 3. Для каждого brief — выдать доступ каждому email
    for (const fk of formKits) {
      for (const email of emails) {
        supabase.functions
          .invoke('google-sheets-create-brief', {
            body: {
              action: 'share',
              workspaceId,
              briefSheetId: fk.brief_sheet_id,
              email,
            },
          })
          .catch((err) => logger.error('Brief share error:', err))
      }
    }
  } catch (error) {
    logger.error('shareBriefsWithParticipants error:', error)
  }
}

interface UseProjectParticipantsMutationsParams {
  projectId: string
  workspaceId: string
  projectParticipants: ParticipantWithUser[]
  participants: Participant[]
  getParticipantsForRole: (roleName: string) => ParticipantWithUser[]
  loadProjectParticipants: () => Promise<ParticipantWithUser[]>
  loadWorkspaceParticipants: () => Promise<Participant[]>
  setProjectParticipants: (pp: ParticipantWithUser[]) => void
  setParticipants: (p: Participant[]) => void
}

export function useProjectParticipantsMutations({
  projectId,
  workspaceId,
  projectParticipants,
  participants,
  getParticipantsForRole,
  loadProjectParticipants,
  loadWorkspaceParticipants,
  setProjectParticipants,
  setParticipants,
}: UseProjectParticipantsMutationsParams) {
  const [isAddParticipantDialogOpen, setIsAddParticipantDialogOpen] = useState(false)
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [addParticipantForRole, setAddParticipantForRole] = useState<string | null>(null)

  // Диалог подтверждения добавления клиента в нон-клиентскую роль
  const [clientConfirmDialog, setClientConfirmDialog] = useState<{
    open: boolean
    roleName: string
    clientNames: string[]
    participantIds: string[]
  }>({ open: false, roleName: '', clientNames: [], participantIds: [] })
  const pendingRoleChangeRef = useRef<{ roleName: string; participantIds: string[] } | null>(null)

  // Выполнение реального изменения ролей
  const applyRoleParticipantsChange = async (roleName: string, participantIds: string[]) => {
    try {
      const currentParticipants = getParticipantsForRole(roleName)
      const currentIds = currentParticipants.map((pp) => pp.participant_id)

      const toAdd = participantIds.filter((id) => !currentIds.includes(id))
      const toRemoveOrUpdate = currentIds.filter((id) => !participantIds.includes(id))

      // Добавляем новых участников
      for (const participantId of toAdd) {
        const existing = projectParticipants.find((pp) => pp.participant_id === participantId)

        if (existing) {
          const { error } = await supabase
            .from('project_participants')
            .update({
              project_roles: [...existing.project_roles, roleName],
            })
            .eq('id', existing.id)

          if (error) throw error
        } else {
          const { error } = await supabase.from('project_participants').insert({
            project_id: projectId,
            participant_id: participantId,
            project_roles: [roleName],
          })

          if (error) throw error
        }
      }

      // Убираем роль или удаляем участника
      for (const participantId of toRemoveOrUpdate) {
        const existing = projectParticipants.find((pp) => pp.participant_id === participantId)
        if (!existing) continue

        const newRoles = existing.project_roles.filter((r) => r !== roleName)
        if (newRoles.length === 0) {
          const { error } = await supabase
            .from('project_participants')
            .delete()
            .eq('id', existing.id)
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('project_participants')
            .update({ project_roles: newRoles })
            .eq('id', existing.id)
          if (error) throw error
        }
      }

      const updated = await loadProjectParticipants()
      setProjectParticipants(updated)
      toast.success('Участники обновлены')

      // Фоновая выдача доступа к брифам новым участникам
      if (toAdd.length > 0) {
        shareBriefsWithParticipants(projectId, workspaceId, toAdd, participants)
      }
    } catch (error) {
      logger.error('Ошибка обновления участников:', error)
      toast.error('Ошибка обновления участников')
    }
  }

  // Обработчик изменения участников для роли — с проверкой клиентов
  const handleRoleParticipantsChange = (roleName: string, participantIds: string[]) => {
    const nonClientProjectRoles = ['Администратор', 'Исполнитель', 'Участник']

    if (nonClientProjectRoles.includes(roleName)) {
      const currentParticipants = getParticipantsForRole(roleName)
      const currentIds = currentParticipants.map((pp) => pp.participant_id)
      const toAdd = participantIds.filter((id) => !currentIds.includes(id))

      const newClientParticipants = toAdd
        .map((id) => participants.find((p) => p.id === id))
        .filter(
          (p) => p && Array.isArray(p.workspace_roles) && p.workspace_roles.includes('Клиент'),
        )
        .filter(Boolean) as Participant[]

      if (newClientParticipants.length > 0) {
        pendingRoleChangeRef.current = { roleName, participantIds }
        setClientConfirmDialog({
          open: true,
          roleName,
          clientNames: newClientParticipants.map(
            (p) => `${p.name}${p.last_name ? ' ' + p.last_name : ''}`,
          ),
          participantIds,
        })
        return
      }
    }

    applyRoleParticipantsChange(roleName, participantIds)
  }

  // Открываем диалог добавления участника
  const handleOpenAddParticipant = (roleName: string) => {
    setAddParticipantForRole(roleName)
    setIsAddParticipantDialogOpen(true)
  }

  // Создаём нового участника workspace
  const handleCreateParticipant = async (data: Partial<Participant>) => {
    try {
      setIsAddingParticipant(true)
      const { data: newParticipant, error } = await supabase
        .from('participants')
        .insert({
          workspace_id: workspaceId,
          name: data.name || '',
          last_name: data.last_name || null,
          email: data.email || '',
          phone: data.phone || null,
          workspace_roles: data.workspace_roles || [],
          can_login: data.can_login ?? true,
        })
        .select()
        .single()

      if (error) throw error

      const updatedParticipants = await loadWorkspaceParticipants()
      setParticipants(updatedParticipants)

      if (addParticipantForRole && newParticipant) {
        const currentIds = getParticipantsForRole(addParticipantForRole).map(
          (pp) => pp.participant_id,
        )
        await applyRoleParticipantsChange(addParticipantForRole, [...currentIds, newParticipant.id])
      }

      setIsAddParticipantDialogOpen(false)
      setAddParticipantForRole(null)
      toast.success('Участник добавлен')
    } catch (error) {
      logger.error('Ошибка добавления участника:', error)
      toast.error('Ошибка добавления участника')
    } finally {
      setIsAddingParticipant(false)
    }
  }

  const confirmClientRole = () => {
    const pending = pendingRoleChangeRef.current
    setClientConfirmDialog((prev) => ({ ...prev, open: false }))
    pendingRoleChangeRef.current = null
    if (pending) {
      applyRoleParticipantsChange(pending.roleName, pending.participantIds)
    }
  }

  const cancelClientConfirm = () => {
    setClientConfirmDialog((prev) => ({ ...prev, open: false }))
    pendingRoleChangeRef.current = null
  }

  return {
    isAddParticipantDialogOpen,
    setIsAddParticipantDialogOpen,
    isAddingParticipant,
    addParticipantForRole,
    setAddParticipantForRole,
    clientConfirmDialog,
    handleRoleParticipantsChange,
    handleOpenAddParticipant,
    handleCreateParticipant,
    confirmClientRole,
    cancelClientConfirm,
  }
}
