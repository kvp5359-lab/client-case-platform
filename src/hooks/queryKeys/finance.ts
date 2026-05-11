/**
 * Query keys для финансового модуля (справочники услуг, ставок налогов и
 * категорий транзакций). Per-project финансы — в `./projects.ts`.
 */

export const financeServiceKeys = {
  all: ['finance-services'] as const,
  list: (workspaceId: string) => ['finance-services', 'list', workspaceId] as const,
}

export const financeTaxRateKeys = {
  all: ['finance-tax-rates'] as const,
  list: (workspaceId: string) => ['finance-tax-rates', 'list', workspaceId] as const,
}

export const financeTxCategoryKeys = {
  all: ['finance-tx-categories'] as const,
  list: (workspaceId: string, kind: 'income' | 'expense') =>
    ['finance-tx-categories', 'list', workspaceId, kind] as const,
}
