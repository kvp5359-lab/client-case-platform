/**
 * ParticipantsTab - вкладка управления участниками workspace
 *
 * Мутации вынесены в useParticipantsMutations
 */

import { useState, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { UserPlus, MessageSquare } from 'lucide-react'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import { MergeTelegramContactDialog } from '@/components/participants/MergeTelegramContactDialog'
import { useWorkspacePermissions } from '@/hooks/permissions'
import type { Participant } from '@/types/entities'
import { useParticipantsMutations } from './useParticipantsMutations'
import { ROLE_CONFIG, TELEGRAM_ROLE } from './constants/roleConfig'
import { ParticipantsSidebar } from './components/ParticipantsSidebar'
import { ParticipantsTable } from './components/ParticipantsTable'
import { TelegramContactsTable } from './components/TelegramContactsTable'

export function ParticipantsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string | 'all'>('all')
  const [defaultRoleForNewParticipant, setDefaultRoleForNewParticipant] = useState<string>('')
  const [mergingContact, setMergingContact] = useState<Participant | null>(null)

  const { can } = useWorkspacePermissions({ workspaceId })
  const canManageParticipants = can('manage_participants')
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const {
    participants,
    isLoading: loading,
    toggleAccessMutation,
    deleteMutation,
    editMutation,
    addMutation,
    mergeMutation,
    actionInProgressId,
  } = useParticipantsMutations(workspaceId)

  const handleToggleAccess = (participantId: string, currentCanLogin: boolean) => {
    toggleAccessMutation.mutate({ participantId, canLogin: !currentCanLogin })
  }

  const handleDeleteParticipant = async (participantId: string) => {
    const ok = await confirm({
      title: 'Удалить участника?',
      description: 'Вы уверены, что хотите удалить этого участника?',
      variant: 'destructive',
      confirmText: 'Удалить',
    })
    if (!ok) return
    deleteMutation.mutate(participantId)
  }

  const handleEditParticipant = (participant: Participant) => {
    setEditingParticipant(participant)
    setIsEditDialogOpen(true)
  }

  const handleSaveParticipant = (updatedData: Partial<Participant>) => {
    if (!editingParticipant) return
    editMutation.mutate(
      { participantId: editingParticipant.id, data: updatedData },
      {
        onSuccess: () => {
          setIsEditDialogOpen(false)
          setEditingParticipant(null)
        },
      },
    )
  }

  const handleAddParticipant = (data: Partial<Participant>) => {
    if (!workspaceId) return
    addMutation.mutate(data, {
      onSuccess: () => {
        setIsAddDialogOpen(false)
        setDefaultRoleForNewParticipant('')
      },
    })
  }

  const handleOpenAddDialog = (role?: string) => {
    setDefaultRoleForNewParticipant(role || '')
    setIsAddDialogOpen(true)
  }

  // Telegram-контакты (отдельно от обычных участников)
  const telegramContacts = participants.filter((p) => p.workspace_roles?.includes(TELEGRAM_ROLE))
  const regularParticipants = participants.filter(
    (p) => !p.workspace_roles?.includes(TELEGRAM_ROLE),
  )

  // Фильтрация участников по выбранной роли
  const isTelegramSection = selectedRole === TELEGRAM_ROLE
  const filteredParticipants = isTelegramSection
    ? telegramContacts
    : selectedRole === 'all'
      ? regularParticipants
      : regularParticipants.filter(
          (p) =>
            p.workspace_roles &&
            Array.isArray(p.workspace_roles) &&
            p.workspace_roles.includes(selectedRole),
        )

  // Подсчёт участников по ролям (без Telegram-контактов)
  const roleStats = useMemo(() => {
    const stats: Record<string, number> = { all: regularParticipants.length }
    for (const role of ROLE_CONFIG) {
      stats[role.statsKey] = regularParticipants.filter((p) =>
        p.workspace_roles?.includes(role.key),
      ).length
    }
    return stats
  }, [regularParticipants])

  return (
    <div className="flex bg-white rounded-lg border min-h-[600px]">
      <ParticipantsSidebar
        selectedRole={selectedRole}
        onSelectRole={setSelectedRole}
        roleStats={roleStats}
        telegramCount={telegramContacts.length}
      />

      {/* Контент с таблицей участников */}
      <div className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1 flex items-center gap-2">
              {(() => {
                if (isTelegramSection)
                  return (
                    <>
                      <MessageSquare className="h-5 w-5" /> Telegram-контакты
                    </>
                  )
                if (selectedRole === 'all') return 'Все участники'
                const roleConfig = ROLE_CONFIG.find((r) => r.key === selectedRole)
                if (!roleConfig) return 'Участники'
                const Icon = roleConfig.icon
                return (
                  <>
                    <Icon className="h-5 w-5" /> {roleConfig.pluralLabel}
                  </>
                )
              })()}
            </h2>
            <p className="text-sm text-gray-600">
              {filteredParticipants.length} {isTelegramSection ? 'контакт(ов)' : 'участник(ов)'}
            </p>
          </div>
          {canManageParticipants && !isTelegramSection && (
            <Button
              onClick={() => handleOpenAddDialog(selectedRole === 'all' ? undefined : selectedRole)}
            >
              <UserPlus className="h-4 w-4 mr-2" />
              Пригласить участника
            </Button>
          )}
        </div>

        <div className="bg-white border rounded-lg">
          {loading ? (
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          ) : filteredParticipants.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {isTelegramSection
                ? 'Нет Telegram-контактов'
                : selectedRole === 'all'
                  ? 'Нет участников в рабочем пространстве'
                  : 'Нет участников с этой ролью'}
            </div>
          ) : isTelegramSection ? (
            <TelegramContactsTable
              contacts={filteredParticipants}
              canManage={canManageParticipants}
              hasRegularParticipants={regularParticipants.length > 0}
              onMerge={setMergingContact}
            />
          ) : (
            <ParticipantsTable
              participants={filteredParticipants}
              onEdit={handleEditParticipant}
              onToggleAccess={handleToggleAccess}
              onDelete={handleDeleteParticipant}
              actionInProgressId={actionInProgressId}
              canManage={canManageParticipants}
            />
          )}
        </div>
      </div>

      {/* Диалог редактирования участника */}
      <EditParticipantDialog
        participant={editingParticipant}
        open={isEditDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setIsEditDialogOpen(false)
            setEditingParticipant(null)
          }
        }}
        onSave={handleSaveParticipant}
        isLoading={editMutation.isPending}
      />

      {/* Диалог добавления участника */}
      <EditParticipantDialog
        participant={null}
        open={isAddDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setIsAddDialogOpen(false)
            setDefaultRoleForNewParticipant('')
          }
        }}
        onSave={handleAddParticipant}
        isLoading={addMutation.isPending}
        defaultRole={defaultRoleForNewParticipant}
      />

      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />

      {/* Диалог привязки Telegram-контакта к участнику */}
      <MergeTelegramContactDialog
        contact={mergingContact}
        participants={regularParticipants}
        open={!!mergingContact}
        onOpenChange={(v) => {
          if (!v) setMergingContact(null)
        }}
        onMerge={(targetId) => {
          if (!mergingContact) return
          mergeMutation.mutate(
            { sourceId: mergingContact.id, targetId },
            { onSuccess: () => setMergingContact(null) },
          )
        }}
        isLoading={mergeMutation.isPending}
      />
    </div>
  )
}
