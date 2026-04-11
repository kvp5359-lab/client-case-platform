import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { knowledgeBaseKeys, statusKeys, knowledgeListKeys } from '@/hooks/queryKeys'
import { supabase } from '@/lib/supabase'
import { useKnowledgeIndex, useArticleVersions } from '@/hooks/knowledge'
import { useArticleEditorMutations } from './useArticleEditorMutations'
import { logger } from '@/utils/logger'

// ---------- Types ----------
// Публичные типы вынесены в useArticleEditor.types.ts — чтобы useArticleEditorMutations
// мог их импортировать без циклической зависимости.
export type {
  EditorKnowledgeArticle,
  EditorKnowledgeGroup,
  EditorKnowledgeTag,
} from './useArticleEditor.types'
import type {
  EditorKnowledgeArticle,
  EditorKnowledgeGroup,
  EditorKnowledgeTag,
} from './useArticleEditor.types'

interface ArticleGroupRow {
  article_id: string
  group_id: string
}

interface ArticleTagRow {
  article_id: string
  tag_id: string
}

// ---------- Hook ----------

export function useArticleEditor() {
  const { workspaceId, articleId } = useParams<{ workspaceId: string; articleId: string }>()
  const router = useRouter()

  // --- Local form state ---
  const [title, setTitle] = useState('')
  const [accessMode, setAccessMode] = useState<'read_only' | 'read_copy'>('read_only')
  const [statusId, setStatusId] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [isContentDirty, setIsContentDirty] = useState(false)
  const [isContentReady, setIsContentReady] = useState(false)
  const [isVersionDialogOpen, setIsVersionDialogOpen] = useState(false)

  // Debounce ref
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)
  const initializedRef = useRef(false)

  // Indexing for AI search
  const { indexNow, isIndexing } = useKnowledgeIndex()

  // Versions — загружаем только когда диалог открыт
  const { createVersion, restoreVersion, isRestoring } = useArticleVersions(
    articleId,
    isVersionDialogOpen,
  )

  // --- Mutations (Z5-73: extracted to separate hook) ---
  const {
    updateArticleMutation,
    updateStatusMutation,
    updateContentMutation,
    updateGroupsMutation,
    updateTagsMutation,
    createTagMutation,
  } = useArticleEditorMutations({
    articleId,
    workspaceId,
    setIsContentDirty,
    setNewTagName,
    setSelectedTagIds,
    selectedTagIds,
  })

  // --- Queries ---

  const articleQuery = useQuery({
    queryKey: knowledgeBaseKeys.article(articleId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .select('*, statuses(id, name, color)')
        .eq('id', articleId!)
        .single()
      if (error) throw error
      return data as EditorKnowledgeArticle
    },
    enabled: !!articleId,
  })

  const groupsQuery = useQuery({
    queryKey: knowledgeBaseKeys.groups(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_groups')
        .select('*')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data || []) as EditorKnowledgeGroup[]
    },
    enabled: !!workspaceId,
  })

  const articleGroupsQuery = useQuery({
    queryKey: knowledgeBaseKeys.articleGroups(articleId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_article_groups')
        .select('article_id, group_id')
        .eq('article_id', articleId!)
      if (error) throw error
      return (data || []) as ArticleGroupRow[]
    },
    enabled: !!articleId,
  })

  const tagsQuery = useQuery({
    queryKey: knowledgeBaseKeys.tags(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_tags')
        .select('id, name, color')
        .eq('workspace_id', workspaceId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data || []) as EditorKnowledgeTag[]
    },
    enabled: !!workspaceId,
  })

  const statusesQuery = useQuery({
    queryKey: statusKeys.knowledgeArticle(workspaceId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('statuses')
        .select('*')
        .eq('entity_type', 'knowledge_article')
        .eq('workspace_id', workspaceId!)
        .order('order_index')
      if (error) throw error
      return (data || []) as { id: string; name: string; color: string }[]
    },
    enabled: !!workspaceId,
  })

  const articleTagsQuery = useQuery({
    queryKey: knowledgeListKeys.articleTags(articleId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('knowledge_article_tags')
        .select('article_id, tag_id')
        .eq('article_id', articleId!)
      if (error) throw error
      return (data || []) as ArticleTagRow[]
    },
    enabled: !!articleId,
  })

  // --- Init form from server data ---

  useEffect(() => {
    if (articleQuery.data && !initializedRef.current) {
      initializedRef.current = true
      const a = articleQuery.data
       
      setTitle(a.title)
       
      setAccessMode(a.access_mode)
       
      setStatusId(a.status_id)
       
      setContent(a.content || '')
      setIsContentReady(true)
    }
  }, [articleQuery.data])

  useEffect(() => {
    if (articleGroupsQuery.data) {
       
      setSelectedGroupIds(articleGroupsQuery.data.map((ag) => ag.group_id))
    }
  }, [articleGroupsQuery.data])

  useEffect(() => {
    if (articleTagsQuery.data) {
       
      setSelectedTagIds(articleTagsQuery.data.map((at) => at.tag_id))
    }
  }, [articleTagsQuery.data])

  // --- Handlers ---

  const handleCreateTag = () => {
    const name = newTagName.trim()
    if (!name) return
    createTagMutation.mutate(name)
  }

  const handleContentChange = useCallback(
    (newContent: string) => {
      setContent(newContent)
      setIsContentDirty(true)
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) updateContentMutation.mutate(newContent)
      }, 1500)
       
    },
    [articleId],
  )

  // Flush pending save + cleanup on unmount
  const contentRef = useRef(content)
  contentRef.current = content
  const isContentDirtyRef = useRef(isContentDirty)
  isContentDirtyRef.current = isContentDirty

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        // Flush: если контент не сохранён — сохраняем синхронно перед unmount
        if (isContentDirtyRef.current) {
          updateContentMutation.mutate(contentRef.current)
        }
      }
      isMountedRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + stable mutation
  }, [])

  const handleSaveSettings = async () => {
    if (!title.trim()) {
      toast.error('Введите название статьи')
      return
    }
    updateArticleMutation.mutate(
      {
        title: title.trim(),
        access_mode: accessMode,
        status_id: statusId,
      },
      {
        onSuccess: () => {
          createVersion(undefined).catch((err) => {
            logger.warn('Не удалось создать версию статьи:', err)
          })
          if (articleId && workspaceId) {
            indexNow(articleId, workspaceId)
          }
        },
      },
    )
  }

  const handleRestoreVersion = (versionId: string) => {
    initializedRef.current = false
    restoreVersion(versionId)
    setIsVersionDialogOpen(false)
  }

  const handleToggleGroup = (groupId: string) => {
    const newGroupIds = selectedGroupIds.includes(groupId)
      ? selectedGroupIds.filter((id) => id !== groupId)
      : [...selectedGroupIds, groupId]
    setSelectedGroupIds(newGroupIds)
    updateGroupsMutation.mutate(newGroupIds)
  }

  const handleToggleTag = (tagId: string) => {
    const newTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId]
    setSelectedTagIds(newTagIds)
    updateTagsMutation.mutate(newTagIds)
  }

  const handleBack = () => {
    router.push(`/workspaces/${workspaceId}/settings/knowledge-base`)
  }

  // --- Derived ---

  // Ждём только основную статью — groups/tags/statuses подгружаются в фоне для метаданных
  const isLoading = articleQuery.isLoading
  const groups = groupsQuery.data || []
  const allTags = tagsQuery.data || []

  return {
    workspaceId,
    articleId,
    isLoading,
    // Article
    articleQuery,
    title,
    setTitle,
    accessMode,
    setAccessMode,
    statusId,
    setStatusId,
    content,
    isContentReady,
    isContentDirty,
    handleContentChange,
    handleSaveSettings,
    updateArticleMutation,
    updateContentMutation,
    updateStatusMutation,
    // Groups
    groups,
    selectedGroupIds,
    handleToggleGroup,
    // Tags
    allTags,
    selectedTagIds,
    handleToggleTag,
    newTagName,
    setNewTagName,
    handleCreateTag,
    createTagMutation,
    // Statuses
    statusesQuery,
    // Versions
    isVersionDialogOpen,
    setIsVersionDialogOpen,
    handleRestoreVersion,
    isRestoring,
    // Indexing
    indexNow,
    isIndexing,
    // Navigation
    handleBack,
  }
}
