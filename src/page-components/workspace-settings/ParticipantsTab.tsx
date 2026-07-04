/**
 * ParticipantsTab - вкладка управления участниками workspace
 *
 * Мутации вынесены в useParticipantsMutations
 */

import { useState, useMemo, useRef, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { UserPlus, MessageSquare, Search, X } from 'lucide-react'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import { MergeTelegramContactDialog } from '@/components/participants/MergeTelegramContactDialog'
import { useWorkspacePermissions } from '@/hooks/permissions'
import type { Participant } from '@/types/entities'
import { useParticipantsMutations } from '@/hooks/permissions/useParticipantsMutations'
import { ROLE_CONFIG, TELEGRAM_ROLE } from './constants/roleConfig'
import { ParticipantsSidebar } from './components/ParticipantsSidebar'
import { ParticipantsTable } from './components/ParticipantsTable'
import { TelegramContactsTable } from './components/TelegramContactsTable'
import { RowsSkeleton } from '@/components/ui/loaders'

export function ParticipantsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string | 'all'>('all')
  const [defaultRoleForNewParticipant, setDefaultRoleForNewParticipant] = useState<string>('')
  const [mergingContact, setMergingContact] = useState<Participant | null>(null)
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(50)

  const PAGE_SIZE = 50
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const { can, isOwner } = useWorkspacePermissions({ workspaceId })
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
    setPasswordMutation,
    actionInProgressId,
  } = useParticipantsMutations(workspaceId)

  const handleToggleAccess = (participantId: string, currentCanLogin: boolean) => {
    toggleAccessMutation.mutate({ participantId, canLogin: !currentCanLogin })
  }

  const handleSetPassword = async (participantId: string) => {
    try {
      return await setPasswordMutation.mutateAsync(participantId)
    } catch {
      return null // ошибку показывает onError мутации (toast)
    }
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

  const handleAddParticipant = async (data: Partial<Participant>) => {
    if (!workspaceId) return
    await addMutation.mutateAsync(data)
    setIsAddDialogOpen(false)
    setDefaultRoleForNewParticipant('')
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
  const byRole = isTelegramSection
    ? telegramContacts
    : selectedRole === 'all'
      ? regularParticipants
      : regularParticipants.filter(
          (p) =>
            p.workspace_roles &&
            Array.isArray(p.workspace_roles) &&
            p.workspace_roles.includes(selectedRole),
        )

  // Поиск по всем полям участника
  const q = search.trim().toLowerCase()
  const filteredParticipants = !q
    ? byRole
    : byRole.filter((p) =>
        [
          p.name,
          p.last_name,
          p.email,
          p.phone,
          p.telegram_username,
          p.telegram_user_id != null ? String(p.telegram_user_id) : '',
          ...(Array.isArray(p.workspace_roles) ? p.workspace_roles : []),
        ].some((v) => (v ?? '').toString().toLowerCase().includes(q)),
      )

  // Бесконечная подгрузка при прокрутке: показываем первые visibleCount строк,
  // увеличиваем при достижении конца списка (IntersectionObserver на sentinel).
  const totalCount = filteredParticipants.length
  const shownCount = Math.min(visibleCount, totalCount)
  const pagedParticipants = filteredParticipants.slice(0, shownCount)

  const resetScroll = () => {
    setVisibleCount(PAGE_SIZE)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  const handleSelectRole = (role: string | 'all') => {
    setSelectedRole(role)
    resetScroll()
  }

  const handleSearchChange = (value: string) => {
    setSearch(value)
    resetScroll()
  }

  // Догрузка следующей порции при появлении sentinel в зоне видимости списка
  useEffect(() => {
    const root = scrollRef.current
    const target = sentinelRef.current
    if (!root || !target) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => (c < totalCount ? c + PAGE_SIZE : c))
        }
      },
      { root, rootMargin: '200px' },
    )
    io.observe(target)
    return () => io.disconnect()
  }, [totalCount])

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
    <div className="flex h-full bg-white rounded-lg border overflow-hidden">
      <ParticipantsSidebar
        selectedRole={selectedRole}
        onSelectRole={handleSelectRole}
        roleStats={roleStats}
        telegramCount={telegramContacts.length}
      />

      {/* Контент с таблицей участников — header/поиск фиксированы, скроллится только список */}
      <div className="flex-1 min-w-0 p-6 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-6 shrink-0">
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
              {totalCount} {isTelegramSection ? 'контакт(ов)' : 'участник(ов)'}
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

        {/* Поиск по всем полям */}
        <div className="mb-4 flex items-center gap-2 rounded-md border px-3 py-2 max-w-md shrink-0">
          <Search className="h-4 w-4 text-gray-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Поиск по имени, email, телефону, Telegram, роли…"
            className="w-full bg-transparent text-sm focus:outline-none"
          />
          {search && (
            <button type="button" onClick={() => handleSearchChange('')} className="shrink-0">
              <X className="h-4 w-4 text-gray-400 hover:text-gray-600" />
            </button>
          )}
        </div>

        {/* Прокручиваемая область — только список. pr-3 даёт зазор справа,
            чтобы overlay-скроллбар (macOS) не накрывал кнопку меню в последней
            колонке. */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto border rounded-lg pr-3">

          {loading ? (
            <RowsSkeleton count={6} className="p-3" />
          ) : filteredParticipants.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {search
                ? 'Ничего не найдено'
                : isTelegramSection
                  ? 'Нет Telegram-контактов'
                  : selectedRole === 'all'
                    ? 'Нет участников в рабочем пространстве'
                    : 'Нет участников с этой ролью'}
            </div>
          ) : (
            <>
              {isTelegramSection ? (
                <TelegramContactsTable
                  contacts={pagedParticipants}
                  canManage={canManageParticipants}
                  hasRegularParticipants={regularParticipants.length > 0}
                  onMerge={setMergingContact}
                />
              ) : (
                <ParticipantsTable
                  participants={pagedParticipants}
                  onEdit={handleEditParticipant}
                  onToggleAccess={handleToggleAccess}
                  onDelete={handleDeleteParticipant}
                  onSetPassword={handleSetPassword}
                  actionInProgressId={actionInProgressId}
                  canManage={canManageParticipants}
                  canImpersonate={isOwner}
                  workspaceId={workspaceId}
                />
              )}
              {/* sentinel для догрузки + индикатор */}
              <div ref={sentinelRef} />
              {shownCount < totalCount && (
                <div className="text-center py-3 text-xs text-gray-400">
                  Показано {shownCount} из {totalCount}…
                </div>
              )}
            </>
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
