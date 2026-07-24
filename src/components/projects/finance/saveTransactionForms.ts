/**
 * Общие куски сохранения пачки операций (многострочная форма) —
 * используются обёрткой общего журнала (WorkspaceTransactionCreateDialog)
 * и вкладкой «Финансы» проекта (ProjectTransactionsSection).
 */

import { toast } from 'sonner'
import type { ProjectTransactionFormData } from '@/hooks/projects/useProjectTransactions'

/** Валидация пачки перед мутацией; при провале — тост, false. */
export function guardTransactionForms(forms: ProjectTransactionFormData[]): boolean {
  if (forms.length === 0 || forms.some((f) => f.amount <= 0)) {
    toast.error('Сумма должна быть больше нуля')
    return false
  }
  return true
}

export const transactionsAddedMessage = (count: number): string =>
  count > 1 ? `Добавлено операций: ${count}` : 'Добавлено'
