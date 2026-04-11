/**
 * useKnowledgeQAData — queries, мутации и фильтрация для Q&A базы знаний
 *
 * Вынесено из KnowledgeQAView.tsx (Z5-70)
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import {
  getQAItems,
  reindexAllArticles,
  deleteQA,
} from '@/services/api/knowledge/knowledgeSearchService'

export function useKnowledgeQAData(workspaceId: string) {
  const queryClient = useQueryClient()

  // --- Queries ---

  const qaQuery = useQuery({
    queryKey: knowledgeBaseKeys.qa(workspaceId),
    queryFn: () => getQAItems(workspaceId),
  })

  const tagsQuery = useQuery({
    queryKey: knowledgeBaseKeys.tags(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_tags')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return data as Array<{ id: string; name: string; color: string }>
    },
  })

  const groupsQuery = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('name')
      if (error) throw error
      return data as Array<{
        id: string
        name: string
        color: string | null
        parent_id: string | null
        sort_order: number
      }>
    },
  })

  const qaItems = qaQuery.data ?? []
  const tags = tagsQuery.data ?? []
  const groups = groupsQuery.data ?? []

  // --- Search & filters ---

  const [searchQuery, setSearchQuery] = useState('')
  const [filterTagIds, setFilterTagIds] = useState<string[]>([])
  const [filterGroupIds, setFilterGroupIds] = useState<string[]>([])

  useEffect(() => {
    setSearchQuery('')
    setFilterTagIds([])
    setFilterGroupIds([])
  }, [workspaceId])

  const filteredItems = useMemo(() => {
    let items = qaItems

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      items = items.filter((qa) => qa.question.toLowerCase().includes(q))
    }

    if (filterTagIds.length > 0) {
      items = items.filter((qa) =>
        qa.knowledge_qa_tags?.some((t) => filterTagIds.includes(t.tag_id)),
      )
    }

    if (filterGroupIds.length > 0) {
      items = items.filter((qa) =>
        qa.knowledge_qa_groups?.some((g) => filterGroupIds.includes(g.group_id)),
      )
    }

    return items
  }, [qaItems, searchQuery, filterTagIds, filterGroupIds])

  // --- Mutations ---

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteQA(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.qa(workspaceId) })
      toast.success('Q&A удалён')
    },
    onError: () => {
      toast.error('Не удалось удалить Q&A')
    },
  })

  const [isReindexing, setIsReindexing] = useState(false)
  const reindexAbortRef = useRef<AbortController | null>(null)

  // B-105: cancel reindex loop on unmount
  useEffect(() => {
    return () => {
      reindexAbortRef.current?.abort()
    }
  }, [])

  const handleReindex = useCallback(async () => {
    reindexAbortRef.current?.abort()
    const abort = new AbortController()
    reindexAbortRef.current = abort

    setIsReindexing(true)
    try {
      let remaining = 1
      const MAX_ITERATIONS = 100
      let iterations = 0
      while (remaining > 0 && iterations < MAX_ITERATIONS) {
        if (abort.signal.aborted) return
        iterations++
        const result = await reindexAllArticles(workspaceId)
        if (abort.signal.aborted) return
        remaining = result.remaining
        if (remaining > 0) {
          toast.info(`Переиндексация... Осталось: ${remaining}`)
        }
      }
      if (!abort.signal.aborted) {
        toast.success('Переиндексация завершена')
        queryClient.invalidateQueries({ queryKey: knowledgeBaseKeys.qa(workspaceId) })
      }
    } catch {
      if (!abort.signal.aborted) {
        toast.error('Ошибка переиндексации')
      }
    } finally {
      if (!abort.signal.aborted) {
        setIsReindexing(false)
      }
    }
  }, [workspaceId, queryClient])

  // --- Filter toggles ---

  const toggleTag = (tagId: string) => {
    setFilterTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    )
  }

  const toggleGroup = (groupId: string) => {
    setFilterGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId],
    )
  }

  const clearFilters = () => {
    setFilterTagIds([])
    setFilterGroupIds([])
  }

  const hasFilters = filterTagIds.length > 0 || filterGroupIds.length > 0

  return {
    // Data
    qaItems,
    tags,
    groups,
    filteredItems,
    isLoading: qaQuery.isLoading,
    // Search & filters
    searchQuery,
    setSearchQuery,
    filterTagIds,
    setFilterTagIds,
    filterGroupIds,
    setFilterGroupIds,
    toggleTag,
    toggleGroup,
    clearFilters,
    hasFilters,
    // Mutations
    deleteMutation,
    isReindexing,
    handleReindex,
  }
}
