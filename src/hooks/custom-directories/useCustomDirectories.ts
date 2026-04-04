"use client"

/**
 * Хук для CRUD операций с пользовательскими справочниками
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { customDirectoryKeys } from '@/hooks/queryKeys'
import type {
  CustomDirectory,
  CustomDirectoryInsert,
  CustomDirectoryUpdate,
} from '@/types/customDirectories'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[а-яё]/gi, (ch) => {
      const map: Record<string, string> = {
        а: 'a',
        б: 'b',
        в: 'v',
        г: 'g',
        д: 'd',
        е: 'e',
        ё: 'yo',
        ж: 'zh',
        з: 'z',
        и: 'i',
        й: 'y',
        к: 'k',
        л: 'l',
        м: 'm',
        н: 'n',
        о: 'o',
        п: 'p',
        р: 'r',
        с: 's',
        т: 't',
        у: 'u',
        ф: 'f',
        х: 'kh',
        ц: 'ts',
        ч: 'ch',
        ш: 'sh',
        щ: 'shch',
        ъ: '',
        ы: 'y',
        ь: '',
        э: 'e',
        ю: 'yu',
        я: 'ya',
      }
      return map[ch.toLowerCase()] ?? ''
    })
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

export function useCustomDirectories() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const queryClient = useQueryClient()

  const {
    data: directories = [],
    isLoading,
    error,
  } = useQuery<CustomDirectory[]>({
    queryKey: customDirectoryKeys.byWorkspace(workspaceId ?? ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_directories')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .eq('is_archived', false)
        .order('order_index')
      if (error) throw error
      return data ?? []
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      icon?: string
      color?: string
    }) => {
      const slug = slugify(input.name) || `dir-${Date.now()}`
      const insert: CustomDirectoryInsert = {
        workspace_id: workspaceId!,
        name: input.name.trim(),
        slug,
        description: input.description?.trim() || null,
        icon: input.icon || 'BookOpen',
        color: input.color || '#6B7280',
        order_index: directories.length,
      }
      const { data, error } = await supabase
        .from('custom_directories')
        .insert(insert)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      toast.success('Справочник создан')
      queryClient.invalidateQueries({
        queryKey: customDirectoryKeys.byWorkspace(workspaceId ?? ''),
      })
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Не удалось создать справочник'
      if (msg.includes('unique')) {
        toast.error('Справочник с таким названием уже существует')
      } else {
        toast.error(msg)
      }
    },
  })

  const updateMutation = useMutation({
    mutationFn: async (params: { id: string; data: CustomDirectoryUpdate }) => {
      const { error } = await supabase
        .from('custom_directories')
        .update(params.data)
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Справочник обновлён')
      queryClient.invalidateQueries({
        queryKey: customDirectoryKeys.byWorkspace(workspaceId ?? ''),
      })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось обновить справочник')
    },
  })

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_directories')
        .update({ is_archived: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Справочник архивирован')
      queryClient.invalidateQueries({
        queryKey: customDirectoryKeys.byWorkspace(workspaceId ?? ''),
      })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось архивировать справочник')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('custom_directories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Справочник удалён')
      queryClient.invalidateQueries({
        queryKey: customDirectoryKeys.byWorkspace(workspaceId ?? ''),
      })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить справочник')
    },
  })

  return {
    directories,
    isLoading,
    error,
    createDirectory: createMutation.mutateAsync,
    updateDirectory: updateMutation.mutate,
    archiveDirectory: archiveMutation.mutate,
    deleteDirectory: deleteMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
  }
}
