"use client"

// Старый роут списка → новый объединённый раздел /boards/list-<id>.

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ListDetailRedirect() {
  const { workspaceId, listId } = useParams<{ workspaceId: string; listId: string }>()
  const router = useRouter()
  useEffect(() => {
    if (workspaceId && listId) {
      router.replace(`/workspaces/${workspaceId}/boards/list-${listId}`)
    }
  }, [workspaceId, listId, router])
  return null
}
