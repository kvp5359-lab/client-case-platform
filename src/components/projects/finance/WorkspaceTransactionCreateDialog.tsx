"use client"

/**
 * WorkspaceTransactionCreateDialog — самодостаточная обёртка формы создания
 * операций в режиме общего журнала воркспейса: сама грузит проекты и валюту,
 * держит мутацию и тосты. Используется страницей «Финансы» и быстрым
 * действием «+» (kind='new_transaction') — одна форма создания везде.
 * Редактирование существующей операции — отдельно (ProjectTransactionFormDialog
 * с editing + onSave).
 */

import { toast } from 'sonner'
import { getUserFacingErrorMessage } from '@/utils/errorMessage'
import { useWorkspaceProjects } from '@/components/messenger/hooks/useChatSettingsData'
import { useWorkspaceCurrency } from '@/hooks/finance/useCurrencySettings'
import { useCreateWorkspaceTransaction } from '@/hooks/finance/useWorkspaceTransactions'
import type {
  ProjectTransactionFormData,
  TransactionType,
} from '@/hooks/projects/useProjectTransactions'
import { ProjectTransactionFormDialog } from './ProjectTransactionFormDialog'
import { guardTransactionForms, transactionsAddedMessage } from './saveTransactionForms'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  type: TransactionType
  /** Предвыбранный проект (например, активный фильтр журнала). */
  initialProjectId?: string | null
}

export function WorkspaceTransactionCreateDialog({
  open,
  onOpenChange,
  workspaceId,
  type,
  initialProjectId,
}: Props) {
  const { baseCurrency } = useWorkspaceCurrency(workspaceId)
  const { data: projects = [] } = useWorkspaceProjects(workspaceId)
  const createMutation = useCreateWorkspaceTransaction(workspaceId)

  const handleSaveMany = (forms: ProjectTransactionFormData[], projectId?: string | null) => {
    if (!projectId) {
      toast.error('Выбери проект')
      return
    }
    if (!guardTransactionForms(forms)) return
    createMutation.mutate(
      { projectId, forms },
      {
        onSuccess: () => {
          toast.success(transactionsAddedMessage(forms.length))
          onOpenChange(false)
        },
        onError: (e: unknown) =>
          toast.error('Не удалось сохранить', { description: getUserFacingErrorMessage(e) }),
      },
    )
  }

  return (
    <ProjectTransactionFormDialog
      open={open}
      onOpenChange={onOpenChange}
      workspaceId={workspaceId}
      type={type}
      editing={null}
      onSaveMany={handleSaveMany}
      saving={createMutation.isPending}
      projects={projects}
      baseCurrency={baseCurrency}
      initialProjectId={initialProjectId}
    />
  )
}
