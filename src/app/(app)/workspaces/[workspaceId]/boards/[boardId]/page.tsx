"use client"

import { useParams, useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Редирект: /boards/[boardId] → /boards
 * Доски теперь открываются как вкладки на общей странице.
 */
export default function BoardRoute() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()

  useEffect(() => {
    if (workspaceId) {
      router.replace(`/workspaces/${workspaceId}/boards`)
    }
  }, [workspaceId, router])

  return null
}
