"use client"

/**
 * Хук для поиска по сообщениям проекта
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useDebounce } from '@/hooks/shared/useDebounce'
import { messengerKeys, STALE_TIME } from '@/hooks/queryKeys'
import type { ProjectMessage, MessageChannel } from '@/services/api/messenger/messengerService'

/** Escape special ilike characters to prevent SQL injection via pattern matching */
function escapeIlike(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const MESSAGE_SELECT = `
  *,
  reply_to_message:project_messages!reply_to_message_id(id, content, sender_name),
  reactions:message_reactions(*),
  attachments:message_attachments(*)
`

export function useMessageSearch(
  projectId: string | undefined,
  channel: MessageChannel = 'client',
  threadId?: string,
) {
  const [searchQuery, setSearchQuery] = useState('')
  const debouncedQuery = useDebounce(searchQuery, 300)
  const isSearchActive = searchQuery.length > 0

  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: threadId
      ? messengerKeys.searchByThreadId(threadId, debouncedQuery)
      : ['messenger', 'search', projectId ?? '', channel, debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery || debouncedQuery.length < 2) return []

      let q = supabase.from('project_messages').select(MESSAGE_SELECT)

      // Thread-first filter
      if (threadId) {
        q = q.eq('thread_id', threadId)
      } else if (projectId) {
        q = q.eq('project_id', projectId).eq('channel', channel)
      } else {
        return []
      }

      const { data, error } = await q
        .ilike('content', `%${escapeIlike(debouncedQuery)}%`)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return (data ?? []) as unknown as ProjectMessage[]
    },
    enabled: !!(projectId || threadId) && debouncedQuery.length >= 2,
    staleTime: STALE_TIME.SHORT,
  })

  const resultCount = useMemo(() => searchResults?.length ?? 0, [searchResults])

  return {
    searchQuery,
    setSearchQuery,
    searchResults: searchResults ?? [],
    isSearching,
    isSearchActive,
    resultCount,
  }
}
