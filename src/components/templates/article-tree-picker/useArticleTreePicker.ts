import { useState, useMemo } from 'react'
import type { ArticleTreePickerGroup, ArticleTreePickerLink } from './types'

interface UseArticleTreePickerOptions {
  mode: 'single-article' | 'single-group' | 'multiple-groups'
  groups: ArticleTreePickerGroup[]
  articles: Array<{ id: string; title: string }>
  articleGroups: ArticleTreePickerLink[]
  excludeGroupIds?: Set<string>
}

export function useArticleTreePicker({
  mode,
  groups,
  articles,
  articleGroups,
  excludeGroupIds,
}: UseArticleTreePickerOptions) {
  const [search, setSearch] = useState('')
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const showArticles = mode === 'single-article'
  const searchLower = search.toLowerCase().trim()

  // Build article-to-groups map
  const articleGroupMap = useMemo(() => {
    if (!showArticles) return new Map<string, Set<string>>()
    const map = new Map<string, Set<string>>()
    for (const link of articleGroups) {
      if (!map.has(link.article_id)) map.set(link.article_id, new Set())
      map.get(link.article_id)!.add(link.group_id)
    }
    return map
  }, [articleGroups, showArticles])

  const getGroupArticles = (groupId: string) =>
    articles.filter((a) => articleGroupMap.get(a.id)?.has(groupId))

  const ungroupedArticles = useMemo(
    () =>
      showArticles
        ? articles.filter(
            (a) => !articleGroupMap.has(a.id) || articleGroupMap.get(a.id)!.size === 0,
          )
        : [],
    [articles, articleGroupMap, showArticles],
  )

  const filteredGroups = useMemo(
    () => (excludeGroupIds ? groups.filter((g) => !excludeGroupIds.has(g.id)) : groups),
    [groups, excludeGroupIds],
  )

  const rootGroups = useMemo(
    () =>
      filteredGroups
        .filter((g) => !g.parent_id || (excludeGroupIds && excludeGroupIds.has(g.parent_id)))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [filteredGroups, excludeGroupIds],
  )

  const getChildGroups = (parentId: string) =>
    filteredGroups
      .filter((g) => g.parent_id === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  const matchingGroupIds = useMemo(() => {
    if (!searchLower) return null
    const ids = new Set<string>()

    const addParents = (groupId: string) => {
      if (excludeGroupIds?.has(groupId)) return
      ids.add(groupId)
      const group = groups.find((g) => g.id === groupId)
      if (group?.parent_id) addParents(group.parent_id)
    }

    if (showArticles) {
      for (const article of articles) {
        if (article.title.toLowerCase().includes(searchLower)) {
          const groupIds = articleGroupMap.get(article.id)
          if (groupIds) {
            for (const gId of groupIds) addParents(gId)
          }
        }
      }
    }

    for (const g of filteredGroups) {
      if (g.name.toLowerCase().includes(searchLower)) {
        ids.add(g.id)
        if (g.parent_id) addParents(g.parent_id)
      }
    }

    return ids
  }, [
    searchLower,
    articles,
    articleGroupMap,
    groups,
    filteredGroups,
    showArticles,
    excludeGroupIds,
  ])

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const closePopover = () => {
    setPopoverOpen(false)
    setSearch('')
  }

  const isGroupVisible = (groupId: string) => {
    if (!matchingGroupIds) return true
    return matchingGroupIds.has(groupId)
  }

  const isArticleVisible = (article: { id: string; title: string }) => {
    if (!searchLower) return true
    return article.title.toLowerCase().includes(searchLower)
  }

  const isGroupNameVisible = (group: ArticleTreePickerGroup) => {
    if (!searchLower) return true
    return group.name.toLowerCase().includes(searchLower)
  }

  const isExpanded = (groupId: string) => {
    if (searchLower && matchingGroupIds?.has(groupId)) return true
    return !collapsedGroups.has(groupId)
  }

  const groupHasVisibleContent = (groupId: string): boolean => {
    if (!showArticles) {
      const group = filteredGroups.find((g) => g.id === groupId)
      if (group && isGroupNameVisible(group)) return true
      const children = getChildGroups(groupId)
      return children.some((child) => isGroupVisible(child.id) && groupHasVisibleContent(child.id))
    }
    const groupArticles = getGroupArticles(groupId)
    if (groupArticles.some(isArticleVisible)) return true
    const group = filteredGroups.find((g) => g.id === groupId)
    if (group && isGroupNameVisible(group)) return true
    const children = getChildGroups(groupId)
    return children.some((child) => isGroupVisible(child.id) && groupHasVisibleContent(child.id))
  }

  const visibleUngrouped = ungroupedArticles.filter(isArticleVisible)

  const hasNoResults =
    !!searchLower &&
    rootGroups.every((g) => !groupHasVisibleContent(g.id)) &&
    (showArticles ? visibleUngrouped.length === 0 : true)

  return {
    search,
    setSearch,
    popoverOpen,
    setPopoverOpen,
    searchLower,
    rootGroups,
    visibleUngrouped,
    hasNoResults,
    toggleGroup,
    closePopover,
    isGroupVisible,
    isArticleVisible,
    isExpanded,
    isGroupNameVisible,
    groupHasVisibleContent,
    getGroupArticles,
    getChildGroups,
  }
}
