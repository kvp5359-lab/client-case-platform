/**
 * Query keys для участников (participants/project_participants), их каналов,
 * permissions и related.
 */

export const participantKeys = {
  all: ['participants'] as const,
  byId: (id: string) => ['participant', 'by-id', id] as const,
  authorName: (userId: string) => ['author-name', userId] as const,
  projectParticipant: (projectId: string, userId: string) =>
    ['participant', 'project', projectId, userId] as const,
  workspaceParticipant: (workspaceId: string, userId: string) =>
    ['participant', 'workspace', workspaceId, userId] as const,
  /** Список всех активных участников воркспейса (с ролями/именами). */
  workspaceList: (workspaceId: string | undefined) =>
    ['workspace-participants', workspaceId] as const,
  /** Полный список project_participants (с вложенной participants). */
  projectFull: (projectId: string | undefined) =>
    ['project-participants-full', projectId] as const,
  /** Лёгкий список участников проекта (avatars). */
  projectAvatars: (projectId: string | undefined) =>
    ['project-participants-avatars', projectId] as const,
  /** project_participants с ролями — для мессенджера. */
  projectWithRoles: (projectId: string | undefined) =>
    ['project-participants-with-roles', projectId] as const,
  /** Лёгкий project_participants без аватарок — для ChatSettings/Dialog. */
  projectLight: (projectId: string | undefined) =>
    ['project-participants', projectId] as const,
  /** Участники проекта сгруппированные по ролям — для хедера страницы проекта. */
  projectHeader: (projectId: string | undefined) =>
    ['project-header-participants', projectId] as const,
}

/** Каналы связи участника (telegram/email/phone и т.д.). */
export const participantChannelKeys = {
  all: ['participant-channels'] as const,
  byParticipant: (participantId: string | undefined) =>
    ['participant-channels', 'by-participant', participantId] as const,
  byWorkspace: (workspaceId: string | undefined) =>
    ['participant-channels', 'by-workspace', workspaceId] as const,
  /** Поиск participant по каналу (для маршрутизации входящих). */
  lookup: (workspaceId: string, channelType: string, externalId: string) =>
    ['participant-channels', 'lookup', workspaceId, channelType, externalId] as const,
}

export const currentParticipantKeys = {
  all: ['current-participant'] as const,
  forUser: (workspaceId: string, userId: string | undefined) =>
    ['current-participant', workspaceId, userId] as const,
}

/**
 * Boards: workspace-level project participants (junction filter).
 */
export const boardParticipantKeys = {
  byWorkspace: (workspaceId: string | undefined) =>
    ['workspace-project-participants', workspaceId ?? ''] as const,
}

export const permissionKeys = {
  participantRoles: (workspaceId: string, userId?: string) =>
    ['participant-roles', workspaceId, userId] as const,
  workspaceRoles: (workspaceId: string) => ['workspace-roles', workspaceId] as const,
  workspaceFeatures: (workspaceId: string) => ['workspace-features', workspaceId] as const,
  projectWorkspace: (projectId: string) => ['project-workspace', projectId] as const,
  projectParticipant: (projectId: string, userId?: string, workspaceId?: string) =>
    ['project-participant', projectId, userId, workspaceId] as const,
  projectRoles: (workspaceId: string) => ['project-roles', workspaceId] as const,
}
