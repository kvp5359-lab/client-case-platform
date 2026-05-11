/**
 * Query keys для документов, наборов документов, генераций и слотов.
 */

export const documentKeys = {
  /** Prefix for broad-invalidate of all document caches. */
  all: ['documents'] as const,
}

export const kitlessDocumentKeys = {
  all: ['kitless-documents'] as const,
  byProject: (projectId: string) => ['kitless-documents', projectId] as const,
}

export const documentKitKeys = {
  all: ['documentKits'] as const,
  byProject: (projectId: string) => ['documentKits', projectId] as const,
}

export const folderSlotKeys = {
  all: ['folder-slots'] as const,
  byProject: (projectId: string) => ['folder-slots', projectId] as const,
  byProjectForTasks: (projectId: string) => ['folder-slots', projectId, 'tasks'] as const,
}

export const folderTemplateSlotKeys = {
  all: ['folder-template-slots'] as const,
  byTemplate: (templateId: string) => ['folder-template-slots', templateId] as const,
}

export const documentGenerationKeys = {
  all: ['document-generations'] as const,
  byProject: (projectId: string) => ['document-generations', projectId] as const,
}

export const documentTemplateKeys = {
  all: ['document-templates'] as const,
  byWorkspace: (workspaceId: string) => ['document-templates', workspaceId] as const,
  detail: (templateId: string) => ['document-templates', 'detail', templateId] as const,
}

/**
 * Document-kit template editor.
 */
export const documentKitTemplateKeys = {
  detail: (kitId: string | undefined) => ['document-kit-template', kitId] as const,
  kitFolders: (kitId: string | undefined) => ['kit-folders', kitId] as const,
  kitFolderSlots: (folderId: string | undefined) => ['kit-folder-slots', folderId] as const,
  kitFolderSlotsAll: (kitFolderIds: string[]) =>
    ['kit-folder-slots-all', ...kitFolderIds] as const,
  listByWorkspace: (workspaceId: string | undefined) =>
    ['document-kit-templates', workspaceId] as const,
}

/**
 * Folder-template editor + counts.
 */
export const folderTemplateKeys = {
  listByWorkspace: (workspaceId: string | undefined) =>
    ['folder-templates', workspaceId] as const,
  slotCounts: (workspaceId: string | undefined) =>
    ['folder-template-slot-counts', workspaceId] as const,
}
