/**
 * useTemplateList — универсальный хук для CRUD-операций над шаблонами
 *
 * Устраняет дублирование в:
 * - FolderTemplatesContent
 * - ProjectTemplatesContent
 * - DocumentKitTemplatesContent
 * - FormTemplatesContent
 *
 * Общая логика: поиск, загрузка, создание, удаление, фильтрация.
 * Копирование и кастомная загрузка — через опциональные параметры.
 */

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * Таблицы шаблонов, с которыми работает этот table-generic хук. Union вместо
 * `string` не даёт передать произвольное имя таблицы. Сам клиент остаётся
 * динамическим (см. ниже) — supabase-js не выводит per-table типы при
 * рантайм-выборе таблицы, а CRUD-форма здесь общая для всех трёх.
 */
export type TemplateTableName =
  | 'document_kit_templates'
  | 'folder_templates'
  | 'project_templates'

type SupabaseDynamic = {
  from: (table: TemplateTableName) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>
      }
    }
    insert: (values: unknown) => Promise<{ error: { message: string } | null }>
    update: (values: unknown) => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>
    }
    delete: () => {
      eq: (col: string, val: unknown) => Promise<{ error: { message: string } | null }>
    }
  }
}
const supabaseDyn = supabase as unknown as SupabaseDynamic
import { toast } from 'sonner'
import { logger } from '@/utils/logger'
import { useConfirmDialog } from '@/hooks/dialogs/useConfirmDialog'

type AnyRecord = Record<string, unknown>

type UseTemplateListConfig<T, TFormData> = {
  /** Ключ таблицы в Supabase */
  tableName: TemplateTableName
  /** Ключ для React Query */
  queryKey: string
  /** ID рабочего пространства */
  workspaceId: string | undefined
  /** Начальные данные формы */
  initialFormData: TFormData
  /** Кастомная функция загрузки (если нужны join'ы или подсчёты) */
  customQueryFn?: () => Promise<T[]>
  /** Кастомная функция создания (если поля отличаются от name+description) */
  customCreateFn?: (data: TFormData) => Promise<void>
  /** Кастомная функция копирования (если нужно копировать дочерние записи) */
  customCopyFn?: (item: T) => Promise<void>
  /** Дополнительные ключи для инвалидации при закрытии диалога */
  invalidateOnClose?: string[]
  /** Колонка сортировки в дефолтной загрузке (по умолчанию created_at, desc) */
  orderByColumn?: string
  /** Направление сортировки (по умолчанию false = desc) */
  orderAscending?: boolean
}

export function useTemplateList<
  T extends { id: string; name: string; description?: string | null },
  TFormData extends { name: string } = { name: string; description: string },
>(config: UseTemplateListConfig<T, TFormData>) {
  const {
    tableName,
    queryKey,
    workspaceId,
    initialFormData,
    customQueryFn,
    customCreateFn,
    customCopyFn,
    invalidateOnClose,
    orderByColumn = 'created_at',
    orderAscending = false,
  } = config

  const queryClient = useQueryClient()
  const { state: confirmState, confirm, handleConfirm, handleCancel } = useConfirmDialog()
  const fullQueryKey = [queryKey, workspaceId]
  // Broad-префикс для инвалидации: покрывает и полный список [queryKey, ws],
  // и лёгкий [queryKey, 'names', ws] (project-templates namesByWorkspace) —
  // иначе пикеры показывали бы устаревший список после CRUD шаблонов.
  const broadInvalidateKey = [queryKey]

  // ============== State ==============

  const [searchQuery, setSearchQuery] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<T | null>(null)
  const [formData, setFormData] = useState<TFormData>(initialFormData)

  // ============== Query ==============

  const { data: items = [], isLoading } = useQuery<T[]>({
    queryKey: fullQueryKey,
    queryFn:
      customQueryFn ??
      (async () => {
        if (!workspaceId) return []
        const { data, error } = await supabaseDyn
          .from(tableName)
          .select('*')
          .eq('workspace_id', workspaceId)
          .order(orderByColumn, { ascending: orderAscending })
        if (error) throw error
        return (data || []) as T[]
      }),
    enabled: !!workspaceId,
  })

  // ============== Mutations ==============

  const saveMutation = useMutation({
    mutationFn: async ({ data, itemId }: { data: TFormData; itemId: string | null }) => {
      if (customCreateFn) {
        await customCreateFn(data)
        return
      }
      if (itemId) {
        const { error } = await supabaseDyn
          .from(tableName)
          .update(data as AnyRecord)
          .eq('id', itemId)
        if (error) throw error
      } else {
        const { error } = await supabaseDyn
          .from(tableName)
          .insert({ ...(data as AnyRecord), workspace_id: workspaceId ?? '' })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: broadInvalidateKey })
      handleCloseDialog()
    },
    onError: (error) => {
      logger.error('Ошибка сохранения шаблона:', error)
      toast.error('Не удалось сохранить шаблон')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabaseDyn.from(tableName).delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: broadInvalidateKey })
    },
    onError: (error) => {
      logger.error('Ошибка удаления шаблона:', error)
      toast.error('Не удалось удалить шаблон')
    },
  })

  const copyMutation = useMutation({
    mutationFn:
      customCopyFn ??
      (async (item: T) => {
        const { error } = await supabaseDyn.from(tableName).insert({
          workspace_id: workspaceId ?? '',
          name: `${item.name} (копия)`,
          description: item.description || null,
        } as AnyRecord)
        if (error) throw error
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: broadInvalidateKey })
    },
    onError: (error) => {
      logger.error('Ошибка копирования шаблона:', error)
      toast.error('Не удалось скопировать шаблон')
    },
  })

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, idx) =>
          supabaseDyn.from(tableName).update({ order_index: idx } as AnyRecord).eq('id', id),
        ),
      )
    },
    onMutate: async (orderedIds: string[]) => {
      await queryClient.cancelQueries({ queryKey: fullQueryKey })
      const prev = queryClient.getQueryData<T[]>(fullQueryKey)
      if (prev) {
        const byId = new Map(prev.map((i) => [i.id, i]))
        const next = orderedIds
          .map((id) => byId.get(id))
          .filter((i): i is T => !!i)
        queryClient.setQueryData<T[]>(fullQueryKey, next)
      }
      return { prev }
    },
    onError: (error, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(fullQueryKey, context.prev)
      logger.error('Ошибка сортировки шаблонов:', error)
      toast.error('Не удалось сохранить порядок')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: broadInvalidateKey })
    },
  })

  // ============== Фильтрация ==============

  const filteredItems = items.filter((item) => {
    const q = searchQuery.toLowerCase()
    return (
      item.name.toLowerCase().includes(q) || (item.description?.toLowerCase().includes(q) ?? false)
    )
  })

  // ============== Handlers ==============

  const handleCreate = useCallback(() => {
    setEditingItem(null)
    setFormData(initialFormData)
    setIsDialogOpen(true)
  }, [initialFormData])

  const handleEdit = useCallback((item: T) => {
    setEditingItem(item)
    setIsDialogOpen(true)
  }, [])

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false)
    setEditingItem(null)
    setFormData(initialFormData)
    if (invalidateOnClose) {
      for (const key of invalidateOnClose) {
        queryClient.invalidateQueries({ queryKey: [key, workspaceId] })
      }
    }
  }, [initialFormData, invalidateOnClose, queryClient, workspaceId])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!formData.name.trim()) return
      saveMutation.mutate({ data: formData, itemId: editingItem?.id ?? null })
    },
    [formData, saveMutation, editingItem],
  )

  const handleCopy = useCallback(
    (item: T) => {
      copyMutation.mutate(item)
    },
    [copyMutation],
  )

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      reorderMutation.mutate(orderedIds)
    },
    [reorderMutation],
  )

  const handleDelete = useCallback(
    async (id: string, confirmMessage: string) => {
      const ok = await confirm({
        title: 'Подтвердите удаление',
        description: confirmMessage,
        confirmText: 'Удалить',
        variant: 'destructive',
      })
      if (!ok) return
      await deleteMutation.mutateAsync(id)
    },
    [confirm, deleteMutation],
  )

  return {
    // Data
    items,
    filteredItems,
    isLoading,

    // Search
    searchQuery,
    setSearchQuery,

    // Dialog
    isDialogOpen,
    setIsDialogOpen,
    editingItem,
    formData,
    setFormData,

    // Handlers
    handleCreate,
    handleEdit,
    handleCloseDialog,
    handleSubmit,
    handleCopy,
    handleReorder,
    handleDelete,

    // Mutation states
    isSaving: saveMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isCopying: copyMutation.isPending,
    isReordering: reorderMutation.isPending,

    // Confirm dialog (parent must render <ConfirmDialog {...confirmDialogProps} />)
    confirmDialogProps: { state: confirmState, onConfirm: handleConfirm, onCancel: handleCancel },
  }
}
