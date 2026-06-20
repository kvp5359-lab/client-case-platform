/**
 * Хуки React Query для модуля «Контекст проекта».
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectContextKeys } from '@/hooks/queryKeys'
import {
  listProjectContextItems,
  createTextItem,
  createFileItem,
  renameItem,
  updateTextItem,
  updateItemAccess,
  softDeleteItem,
  restoreItem,
  hardDeleteItem,
  runExtraction,
  type ContextItemAccess,
  type ProjectContextItemWithFile,
} from '@/services/api/projectContext/projectContextService'

export function useProjectContextItems(projectId: string | undefined) {
  return useQuery<ProjectContextItemWithFile[]>({
    queryKey: projectId ? projectContextKeys.byProject(projectId) : ['project-context', 'disabled'],
    queryFn: () => listProjectContextItems(projectId as string),
    enabled: !!projectId,
    staleTime: 60_000,
  })
}

export function useCreateContextText() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createTextItem,
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: projectContextKeys.byProject(item.project_id) })
    },
  })
}

export function useCreateContextFile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createFileItem,
    onSuccess: (item) => {
      qc.invalidateQueries({ queryKey: projectContextKeys.byProject(item.project_id) })
    },
  })
}

export function useRenameContextItem(projectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameItem(id, name),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byProject(projectId) })
      }
    },
  })
}

export function useUpdateContextText(projectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, contentHtml }: { id: string; contentHtml: string }) =>
      updateTextItem(id, contentHtml),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byProject(projectId) })
      }
    },
  })
}

export function useUpdateContextAccess(projectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, access }: { id: string; access: ContextItemAccess }) =>
      updateItemAccess(id, access),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byProject(projectId) })
      }
    },
  })
}

export function useDeleteContextItem(projectId: string | undefined, workspaceId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => softDeleteItem(id),
    onSuccess: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byProject(projectId) })
      }
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byWorkspaceTrash(workspaceId) })
      }
    },
  })
}

export function useRestoreContextItem(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => restoreItem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectContextKeys.all })
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byWorkspaceTrash(workspaceId) })
      }
    },
  })
}

export function useHardDeleteContextItem(workspaceId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => hardDeleteItem(id),
    onSuccess: () => {
      if (workspaceId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byWorkspaceTrash(workspaceId) })
      }
    },
  })
}

export function useRunContextExtraction(projectId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (item: ProjectContextItemWithFile) => runExtraction(item),
    onSettled: () => {
      if (projectId) {
        qc.invalidateQueries({ queryKey: projectContextKeys.byProject(projectId) })
      }
    },
  })
}
