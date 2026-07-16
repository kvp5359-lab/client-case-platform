"use client"

/**
 * Что развёрнуто в пикере: группы статей и дерево документов.
 *
 * Две противоположные модели — намеренно: группы и папки по умолчанию СВЁРНУТЫ
 * (их много, список должен читаться), а наборы документов — РАЗВЁРНУТЫ, иначе
 * при открытии вкладки не видно вообще ничего. Отсюда expanded* против collapsedKits.
 *
 * forceExpand (активен поиск) раскрывает всё поверх состояния: список уже
 * отфильтрован, прятать нечего.
 */

import { useState } from 'react'

export function useShareExpansion({
  allGroupNames,
  allFolderIds,
  forceExpand,
}: {
  allGroupNames: string[]
  allFolderIds: string[]
  forceExpand: boolean
}) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [collapsedKits, setCollapsedKits] = useState<Set<string>>(new Set())

  const toggleIn = (setter: typeof setExpandedGroups) => (id: string) =>
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const allGroupsExpanded =
    allGroupNames.length > 0 && allGroupNames.every((g) => forceExpand || expandedGroups.has(g))
  const allFoldersExpanded =
    allFolderIds.length > 0 && allFolderIds.every((id) => forceExpand || expandedFolders.has(id))

  return {
    expandedGroups,
    toggleGroup: toggleIn(setExpandedGroups),
    allGroupsExpanded,
    toggleAllGroups: () =>
      setExpandedGroups(allGroupsExpanded ? new Set() : new Set(allGroupNames)),

    expandedFolders,
    collapsedKits,
    toggleFolder: toggleIn(setExpandedFolders),
    toggleKit: toggleIn(setCollapsedKits),
    allFoldersExpanded,
    /** «Развернуть всё» на вкладке документов: раскрыть и наборы, и все папки. */
    toggleAllFolders: () => {
      if (allFoldersExpanded) {
        setExpandedFolders(new Set())
      } else {
        setExpandedFolders(new Set(allFolderIds))
        setCollapsedKits(new Set())
      }
    },
  }
}
