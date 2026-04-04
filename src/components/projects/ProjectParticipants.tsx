"use client"

/**
 * ProjectParticipants Component
 * Управление участниками проекта с назначением ролей
 */

import { Loader2 } from 'lucide-react'
import { ParticipantsPicker } from '@/components/participants/ParticipantsPicker'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import { ClientConfirmDialog } from './ClientConfirmDialog'
import { useProjectParticipantsData } from './hooks/useProjectParticipantsData'
import { useProjectParticipantsMutations } from './hooks/useProjectParticipantsMutations'

interface ProjectParticipantsProps {
  projectId: string
  workspaceId: string
  createdBy: string | null
  createdAt?: string | null
}

export function ProjectParticipants({
  projectId,
  workspaceId,
  createdBy,
  createdAt,
}: ProjectParticipantsProps) {
  const {
    loading,
    projectRoles,
    participants,
    projectParticipants,
    setProjectParticipants,
    setParticipants,
    creatorParticipant,
    getParticipantsForRole,
    loadProjectParticipants,
    loadWorkspaceParticipants,
  } = useProjectParticipantsData({ projectId, workspaceId, createdBy })

  const {
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
  } = useProjectParticipantsMutations({
    projectId,
    workspaceId,
    projectParticipants,
    participants,
    getParticipantsForRole,
    loadProjectParticipants,
    loadWorkspaceParticipants,
    setProjectParticipants,
    setParticipants,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Переводим роли на множественное число
  const getRoleLabel = (roleName: string) => {
    const roleDescriptions: Record<string, string> = {
      Администратор: 'Администраторы',
      Исполнитель: 'Исполнители',
      Клиент: 'Клиенты',
      Участник: 'Наблюдатели',
    }
    return roleDescriptions[roleName] || roleName
  }

  return (
    <div className="space-y-5">
      {/* Автор проекта (только для отображения) */}
      <div className="grid grid-cols-[140px_1fr] gap-4 items-center">
        <label className="text-sm font-medium">Автор проекта</label>
        <div className="text-sm">
          {creatorParticipant ? (
            <span>
              {creatorParticipant.name}
              {createdAt && (
                <span className="text-muted-foreground ml-2">
                  ({new Date(createdAt).toLocaleString('ru-RU')})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Не указан</span>
          )}
        </div>
      </div>

      {/* Роли проекта */}
      <div className="space-y-2">
        {projectRoles.map((role) => {
          const roleParticipants = getParticipantsForRole(role.name)
          const selectedIds = roleParticipants.map((pp) => pp.participant_id)

          return (
            <div key={role.id} className="grid grid-cols-[140px_1fr] gap-4 items-start">
              <label className="text-sm font-medium pt-2.5">{getRoleLabel(role.name)}</label>
              <ParticipantsPicker
                participants={participants}
                selectedIds={selectedIds}
                onChange={(ids) => handleRoleParticipantsChange(role.name, ids)}
                placeholder="Выберите участников..."
                onAddNew={() => handleOpenAddParticipant(role.name)}
              />
            </div>
          )
        })}
      </div>

      {/* Диалог добавления участника */}
      <EditParticipantDialog
        participant={null}
        open={isAddParticipantDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setIsAddParticipantDialogOpen(false)
            setAddParticipantForRole(null)
          }
        }}
        onSave={handleCreateParticipant}
        isLoading={isAddingParticipant}
        defaultRole={addParticipantForRole === 'Клиент' ? 'Клиент' : undefined}
      />

      {/* Диалог подтверждения добавления клиента в нон-клиентскую роль */}
      <ClientConfirmDialog
        open={clientConfirmDialog.open}
        roleName={clientConfirmDialog.roleName}
        clientNames={clientConfirmDialog.clientNames}
        onConfirm={confirmClientRole}
        onCancel={cancelClientConfirm}
      />
    </div>
  )
}
