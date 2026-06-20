'use client'

/**
 * Модал для просмотра и редактирования текстовой записи «Контекста проекта».
 * Использует полноценный TiptapEditor (тот же, что и для статей знаний).
 */

import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAuth } from '@/contexts/AuthContext'
import { ChatSettingsAccess } from '@/components/messenger/ChatSettingsAccess'
import { useProjectParticipants } from '@/components/messenger/hooks/useChatSettingsData'
import type { AccessType } from '@/components/messenger/chatSettingsTypes'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TiptapEditor } from '@/components/tiptap-editor/tiptap-editor'
import {
  useRenameContextItem,
  useUpdateContextText,
  useUpdateContextAccess,
} from '@/hooks/projects/useProjectContext'
import type { ProjectContextItemWithFile } from '@/services/api/projectContext/projectContextService'

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

type Props = {
  item: ProjectContextItemWithFile
  projectId: string
  workspaceId: string
  onClose: () => void
}

export function ContextTextDialog({ item, projectId, workspaceId, onClose }: Props) {
  const { user } = useAuth()
  const { data: participants = [] } = useProjectParticipants(projectId)

  const [name, setName] = useState(item.name)
  const [content, setContent] = useState(item.content_html ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Доступ к заметке (кто видит) — локальное состояние, сохраняется по «Сохранить»
  const [accessType, setAccessType] = useState<AccessType>(
    (item.access_type as AccessType) ?? 'all',
  )
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    new Set(item.access_roles ?? []),
  )
  const [memberIds, setMemberIds] = useState<Set<string>>(
    new Set((item.members ?? []).map((m) => m.participant_id)),
  )

  const renameMutation = useRenameContextItem(projectId)
  const updateMutation = useUpdateContextText(projectId)
  const accessMutation = useUpdateContextAccess(projectId)

  const accessDirty = useMemo(() => {
    const initialRoles = new Set(item.access_roles ?? [])
    const initialMembers = new Set((item.members ?? []).map((m) => m.participant_id))
    return (
      accessType !== ((item.access_type as AccessType) ?? 'all') ||
      !setsEqual(selectedRoles, initialRoles) ||
      !setsEqual(memberIds, initialMembers)
    )
  }, [accessType, selectedRoles, memberIds, item.access_type, item.access_roles, item.members])

  const isDirty =
    name.trim() !== item.name || content !== (item.content_html ?? '') || accessDirty

  // Закрытие с подтверждением, если есть несохранённые изменения
  const requestClose = () => {
    if (isDirty) {
      setConfirmOpen(true)
      return
    }
    onClose()
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error('Укажите название')
      return
    }
    try {
      const tasks: Promise<void>[] = []
      if (trimmedName !== item.name) {
        tasks.push(renameMutation.mutateAsync({ id: item.id, name: trimmedName }))
      }
      if (content !== (item.content_html ?? '')) {
        tasks.push(updateMutation.mutateAsync({ id: item.id, contentHtml: content }))
      }
      if (accessDirty) {
        tasks.push(
          accessMutation.mutateAsync({
            id: item.id,
            access: {
              accessType,
              accessRoles: Array.from(selectedRoles),
              memberIds: Array.from(memberIds),
            },
          }),
        )
      }
      await Promise.all(tasks)
      toast.success('Сохранено')
      onClose()
    } catch (err) {
      toast.error('Не удалось сохранить', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const isSaving =
    renameMutation.isPending || updateMutation.isPending || accessMutation.isPending

  return (
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        className="max-w-3xl !overflow-visible"
        hideClose
        onInteractOutside={(e) => {
          // Не закрываем по клику вне, если есть несохранённые изменения —
          // сначала спросим подтверждение
          if (isDirty) {
            e.preventDefault()
            setConfirmOpen(true)
          }
        }}
      >
        {/* Крестик-кружок в верхнем правом углу */}
        <button
          type="button"
          onClick={requestClose}
          title="Закрыть"
          aria-label="Закрыть"
          className="absolute -right-3 -top-3 z-10 h-7 w-7 rounded-full border bg-background shadow-md flex items-center justify-center text-muted-foreground transition-all hover:scale-110 hover:bg-muted hover:text-foreground active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>

        <DialogHeader>
          <DialogTitle className="sr-only">Заметка контекста проекта</DialogTitle>
          <div className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 text-lg font-semibold h-9 px-3"
              placeholder="Название записи"
            />
            <Button onClick={handleSave} disabled={!isDirty || isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Сохранить
            </Button>
          </div>
        </DialogHeader>

        <ChatSettingsAccess
          participants={participants}
          userId={user?.id}
          isEditMode
          isTask={false}
          accessType={accessType}
          memberIds={memberIds}
          selectedMemberIds={memberIds}
          selectedRoles={selectedRoles}
          onAccessChange={(newAccess, roles) => {
            setAccessType(newAccess)
            if (roles) setSelectedRoles(new Set(roles))
          }}
          onToggleMember={(pid) =>
            setMemberIds((prev) => {
              const next = new Set(prev)
              if (next.has(pid)) next.delete(pid)
              else next.add(pid)
              return next
            })
          }
          onSetAccessType={setAccessType}
          onSetSelectedMemberIds={setMemberIds}
          onSetSelectedRoles={setSelectedRoles}
          label="Кто видит заметку"
          hint="Добавленный участник увидит эту заметку, даже если по умолчанию она доступна только команде."
        />

        <div className="border rounded-md">
          <TiptapEditor
            content={content}
            onChange={setContent}
            className="max-h-[calc(100vh-220px)]"
            placeholder="Текст заметки. Доступно форматирование, списки, заголовки, картинки..."
            minHeight="320px"
            imageUpload={{ workspaceId, articleId: item.id }}
          />
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть без сохранения?</AlertDialogTitle>
            <AlertDialogDescription>
              В заметке есть несохранённые изменения. Если закрыть сейчас, они будут потеряны.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Продолжить редактирование</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false)
                onClose()
              }}
            >
              Закрыть без сохранения
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
