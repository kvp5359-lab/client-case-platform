/**
 * Query keys для интеграций воркспейса (Telegram groups/business/MTProto,
 * Gmail, Wazzup) и привязки тредов к каналам.
 */

export const integrationsKeys = {
  all: ['integrations'] as const,
  workspace: (workspaceId: string) =>
    ['integrations', 'workspace-integrations', workspaceId] as const,
  telegramGroups: (workspaceId: string) =>
    ['integrations', 'telegram-groups', workspaceId] as const,
  gmailAccounts: (workspaceId: string) =>
    ['integrations', 'gmail-accounts', workspaceId] as const,
  businessConnections: (workspaceId: string) =>
    ['integrations', 'business-connections', workspaceId] as const,
  tgLinks: (workspaceId: string, userId: string | null | undefined) =>
    ['integrations', 'tg-links', workspaceId, userId ?? null] as const,
  mtprotoSessions: (workspaceId: string) =>
    ['integrations', 'mtproto-sessions', workspaceId] as const,
}

/**
 * Telegram link code for thread binding.
 */
export const telegramLinkKeys = {
  linkCode: (threadId: string | undefined) =>
    ['messenger', 'link-code', threadId ?? 'no-thread'] as const,
  /** Fallback key when no threadId — matches messengerKeys.telegramLinkByThreadId pattern. */
  noThread: ['messenger', 'telegram-link', 'no-thread'] as const,
}

/**
 * Wazzup (WhatsApp/Instagram). Раньше ключи были размазаны: локальный
 * wazzupKeys в useWazzup.ts + литерал 'my-channels' в WazzupNumbersSection.
 */
export const wazzupKeys = {
  settings: (wsId: string) => ['wazzup', 'settings', wsId] as const,
  channels: (wsId: string) => ['wazzup', 'channels', wsId] as const,
  /** Broad-prefix личных каналов сотрудника в воркспейсе. */
  myChannelsByWorkspace: (wsId: string) => ['wazzup', 'my-channels', wsId] as const,
  myChannels: (wsId: string, userId: string) =>
    ['wazzup', 'my-channels', wsId, userId] as const,
}
