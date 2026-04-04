/**
 * Хук загрузки дерева базы знаний (группы + статьи).
 * Используется в AddKnowledgeDialog.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GroupNode } from './GroupTreeNode'

interface TreeData {
  roots: GroupNode[]
  ungroupedArticles: { id: string; title: string }[]
}

export function useKnowledgeTreeData(workspaceId: string | undefined, enabled: boolean) {
  return useQuery<TreeData>({
    queryKey: ['knowledge-tree', workspaceId],
    queryFn: async () => {
      if (!workspaceId) return { roots: [], ungroupedArticles: [] }

      const [groupsRes, articlesRes, linksRes] = await Promise.all([
        supabase
          .from('knowledge_groups')
          .select('id, name, parent_id, sort_order')
          .eq('workspace_id', workspaceId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('knowledge_articles')
          .select('id, title')
          .eq('workspace_id', workspaceId)
          .order('title', { ascending: true }),
        supabase.from('knowledge_article_groups').select('article_id, group_id'),
      ])

      const groups = groupsRes.data || []
      const articles = articlesRes.data || []
      const links = linksRes.data || []

      // group_id -> articles
      const groupArticleMap = new Map<string, { id: string; title: string }[]>()
      const articleInGroup = new Set<string>()

      for (const link of links) {
        const article = articles.find((a) => a.id === link.article_id)
        if (!article) continue
        articleInGroup.add(article.id)
        const list = groupArticleMap.get(link.group_id) || []
        list.push({ id: article.id, title: article.title || 'Без названия' })
        groupArticleMap.set(link.group_id, list)
      }

      // Build tree from flat list
      const nodeMap = new Map<string, GroupNode>()
      for (const g of groups) {
        nodeMap.set(g.id, {
          id: g.id,
          name: g.name,
          parentId: g.parent_id,
          articles: groupArticleMap.get(g.id) || [],
          children: [],
        })
      }

      const roots: GroupNode[] = []
      for (const node of nodeMap.values()) {
        if (node.parentId && nodeMap.has(node.parentId)) {
          nodeMap.get(node.parentId)!.children.push(node)
        } else {
          roots.push(node)
        }
      }

      const ungroupedArticles = articles
        .filter((a) => !articleInGroup.has(a.id))
        .map((a) => ({ id: a.id, title: a.title || 'Без названия' }))

      return { roots, ungroupedArticles }
    },
    enabled: enabled && !!workspaceId,
  })
}
