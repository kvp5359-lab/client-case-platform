"use client"

import { useState, useMemo } from 'react'
import { Mail, Phone, Send, X, Search, Pencil, Check, Settings2, Eye } from 'lucide-react'
import { ThreadGroups } from '@/components/contacts/ContactThreadGroups'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  useContactParticipant,
  useContactThreads,
  useMergeParticipants,
  useRenameParticipant,
} from '@/hooks/useContactCard'
import { useWorkspaceParticipants } from '@/hooks/shared/useWorkspaceParticipants'
import { useWorkspaceSidebarSettings } from '@/hooks/useWorkspaceSidebarSettings'
import { useParticipantsMutations } from '@/hooks/permissions/useParticipantsMutations'
import { useWorkspacePermissions } from '@/hooks/permissions'
import { EditParticipantDialog } from '@/components/participants/EditParticipantDialog'
import { StartImpersonationDialog } from '@/components/impersonation/StartImpersonationDialog'
import { openThreadById } from '@/components/tasks/openThreadById'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Participant } from '@/types/entities'
import { cn } from '@/lib/utils'

type ContactCardDialogProps = {
  participantId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenThread?: (threadId: string) => void
  /** Открыть сразу форму полного редактирования участника. */
  initialFullEdit?: boolean
}

export function ContactCardDialog({
  participantId,
  open,
  onOpenChange,
  onOpenThread,
  initialFullEdit = false,
}: ContactCardDialogProps) {
  const { data: contact } = useContactParticipant(participantId)
  const { data: threads = [] } = useContactThreads(participantId)
  // Серый префикс проекта — идентично сайдбару (workspace-настройка + гейт шаблона).
  const { data: sidebarSettings } = useWorkspaceSidebarSettings(contact?.workspace_id)
  const showProjectPrefixes = sidebarSettings.showProjectPrefixes
  const [mergeMode, setMergeMode] = useState(false)

  const openThread = (threadId: string) => {
    // В глобальном режиме (карточка из чата) onOpenThread не прокинут —
    // открываем тред напрямую по id.
    if (onOpenThread) onOpenThread(threadId)
    else void openThreadById(threadId)
    onOpenChange(false)
  }
  // initialFullEdit разворачивает форму полного редактирования сразу при
  // открытии. Корректность держится на key={participantId} в
  // GlobalContactCardDialog — диалог пересоздаётся на каждый новый контакт.
  const [fullEditOpen, setFullEditOpen] = useState(initialFullEdit)
  const [impersonateOpen, setImpersonateOpen] = useState(false)
  const { editMutation } = useParticipantsMutations(contact?.workspace_id)

  // «Войти под пользователем» — только Владельцу, у участника есть привязанный
  // аккаунт (user_id) и он не другой Владелец. Зеркалит условия из меню
  // участника (ParticipantMenu → StartImpersonationDialog).
  const { isOwner } = useWorkspacePermissions({ workspaceId: contact?.workspace_id })
  const canImpersonate =
    isOwner &&
    !!contact?.user_id &&
    !contact.workspace_roles?.includes('Владелец')

  const handleSaveFull = (data: Partial<Participant>) => {
    if (!contact) return
    editMutation.mutate(
      { participantId: contact.id, data },
      { onSuccess: () => setFullEditOpen(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            {contact ? (
              <RenameInline contact={contact} />
            ) : (
              'Контакт'
            )}
          </DialogTitle>
        </DialogHeader>

        {!contact ? (
          <div className="text-sm text-muted-foreground py-4">Загрузка...</div>
        ) : mergeMode ? (
          <MergePicker
            contact={contact}
            onCancel={() => setMergeMode(false)}
            onDone={() => {
              setMergeMode(false)
              onOpenChange(false)
            }}
          />
        ) : (
          <>
            <div className="space-y-2 text-sm">
              {contact.email && !/@(no-email\.local|telegram\.placeholder)$/i.test(contact.email) && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <span>{contact.email}</span>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <span>{contact.phone}</span>
                </div>
              )}
              {contact.telegram_user_id && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Send className="h-3.5 w-3.5 text-gray-400" />
                  <span>tg:{contact.telegram_user_id}</span>
                </div>
              )}
              {contact.telegram_username && (
                <div className="flex items-center gap-2 text-gray-700">
                  <Send className="h-3.5 w-3.5 text-gray-400" />
                  <a
                    href={`https://t.me/${contact.telegram_username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    @{contact.telegram_username}
                  </a>
                </div>
              )}
              {contact.notes && (
                <div className="text-gray-600 text-xs whitespace-pre-wrap pt-1">{contact.notes}</div>
              )}
            </div>

            {/* min-w-0: DialogContent — grid, его элементы не сжимаются под
                контент (min-width:auto) → длинные названия тредов распирали
                диалог. min-w-0 разрешает усадку → внутренний truncate работает. */}
            <div className="border-t pt-3 min-w-0">
              <div className="text-xs font-medium text-gray-500 mb-2">
                Переписки ({threads.length})
              </div>
              <ThreadGroups
                threads={threads}
                onOpenThread={openThread}
                showPrefixes={showProjectPrefixes}
              />
            </div>

            <div className="border-t pt-3 flex items-center gap-2 flex-wrap">
              {canImpersonate && (
                <button
                  type="button"
                  onClick={() => setImpersonateOpen(true)}
                  className="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 inline-flex items-center gap-1.5"
                >
                  <Eye className="h-3 w-3" />
                  Войти под пользователем
                </button>
              )}
              <button
                type="button"
                onClick={() => setFullEditOpen(true)}
                className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600 inline-flex items-center gap-1.5"
              >
                <Settings2 className="h-3 w-3" />
                Открыть полную карточку
              </button>
              {/* Слияние — только для контактов без логина (сотрудника нельзя «присоединить»). */}
              {!contact.can_login && !contact.user_id && (
                <button
                  type="button"
                  onClick={() => setMergeMode(true)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 text-gray-600"
                >
                  Объединить с другим контактом…
                </button>
              )}
            </div>
          </>
        )}
      </DialogContent>
      {contact && (
        <EditParticipantDialog
          participant={contact as unknown as Participant}
          open={fullEditOpen}
          onOpenChange={setFullEditOpen}
          onSave={handleSaveFull}
          isLoading={editMutation.isPending}
        />
      )}
      {canImpersonate && contact?.user_id && (
        <StartImpersonationDialog
          open={impersonateOpen}
          onOpenChange={setImpersonateOpen}
          workspaceId={contact.workspace_id}
          targetUserId={contact.user_id}
          targetName={`${contact.name}${contact.last_name ? ' ' + contact.last_name : ''}`}
        />
      )}
    </Dialog>
  )
}

type MergePickerProps = {
  contact: NonNullable<ReturnType<typeof useContactParticipant>['data']>
  onCancel: () => void
  onDone: () => void
}

function MergePicker({ contact, onCancel, onDone }: MergePickerProps) {
  const [search, setSearch] = useState('')
  const { data: allParticipants = [] } = useWorkspaceParticipants(contact.workspace_id)
  const mergeMutation = useMergeParticipants(contact.workspace_id)
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allParticipants
      .filter((p) => p.id !== contact.id) // не сам с собой
      .filter((p) => {
        const name = [p.name, p.last_name].filter(Boolean).join(' ').toLowerCase()
        const email = (p.email ?? '').toLowerCase()
        return q === '' || name.includes(q) || email.includes(q)
      })
      .slice(0, 50)
  }, [allParticipants, search, contact.id])

  return (
    <div>
      <p className="text-sm text-gray-600 mb-3">
        Выбери целевой контакт. Текущий ({contact.name}) будет в него «влит» — все переписки переедут,
        а сам он скроется.
      </p>
      <div className="flex items-center gap-2 mb-2 px-2 py-1 border rounded">
        <Search className="h-3.5 w-3.5 text-gray-400" />
        <input
          type="text"
          autoFocus
          placeholder="Поиск по имени или email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm focus:outline-none bg-transparent"
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="max-h-72 overflow-y-auto border rounded">
        {candidates.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">Ничего не найдено</div>
        ) : (
          candidates.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={mergeMutation.isPending}
              onClick={async () => {
                const ok = await confirm({
                  title: 'Объединить контакты?',
                  description:
                    `«${contact.name}» будет влит в «${p.name}». ` +
                    `Все переписки текущего контакта перейдут в выбранный, а текущий будет скрыт.`,
                  variant: 'destructive',
                })
                if (!ok) return
                mergeMutation.mutate(
                  { targetId: p.id, sourceId: contact.id },
                  { onSuccess: onDone },
                )
              }}
              className={cn(
                'w-full text-left px-2 py-1.5 hover:bg-gray-50 flex flex-col disabled:opacity-50',
              )}
            >
              <span className="text-sm">
                {[p.name, p.last_name].filter(Boolean).join(' ')}
                {p.can_login && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-blue-600">
                    сотрудник
                  </span>
                )}
              </span>
              {p.email && !/@(no-email\.local|telegram\.placeholder)$/i.test(p.email) && (
                <span className="text-xs text-gray-500">{p.email}</span>
              )}
            </button>
          ))
        )}
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
        >
          Отмена
        </button>
      </div>
      <ConfirmDialog state={confirmState} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  )
}

type RenameInlineProps = {
  contact: NonNullable<ReturnType<typeof useContactParticipant>['data']>
}

function RenameInline({ contact }: RenameInlineProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(contact.name)
  const [lastName, setLastName] = useState(contact.last_name ?? '')
  const renameMutation = useRenameParticipant()

  // Сброс локального состояния при смене контакта/при отмене редактирования —
  // render-time pattern из React docs (вместо useEffect + setState):
  // https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes
  const [lastSyncedId, setLastSyncedId] = useState(contact.id)
  if (!editing && contact.id !== lastSyncedId) {
    setLastSyncedId(contact.id)
    setName(contact.name)
    setLastName(contact.last_name ?? '')
  }

  // Сотрудников переименовывать через эту карточку не даём — у них есть свой
  // профиль; имя может тянуться из user_metadata.
  const canRename = !contact.can_login && !contact.user_id

  if (!editing) {
    const fullName = `${contact.name}${contact.last_name ? ' ' + contact.last_name : ''}`
    return (
      <div className="flex items-center gap-2">
        <span>{fullName}</span>
        {canRename && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-gray-400 hover:text-gray-700 p-0.5 rounded"
            aria-label="Переименовать контакт"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    )
  }

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    renameMutation.mutate(
      {
        participantId: contact.id,
        name: trimmed,
        lastName: lastName.trim() || null,
      },
      { onSuccess: () => setEditing(false) },
    )
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="Имя"
        className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gray-400 min-w-0 flex-1"
      />
      <input
        type="text"
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        placeholder="Фамилия"
        className="text-sm border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-gray-400 min-w-0 flex-1"
      />
      <button
        type="button"
        onClick={save}
        disabled={renameMutation.isPending || !name.trim()}
        className="p-1 rounded bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
        aria-label="Сохранить"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={renameMutation.isPending}
        className="p-1 rounded text-gray-500 hover:bg-gray-100"
        aria-label="Отмена"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
