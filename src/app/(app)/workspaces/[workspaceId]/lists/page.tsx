"use client"

// Раздел «Списки» объединён с «Досками» (вкладки досок+списков в одном баре).
// Старый роут редиректит на /boards.

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function ListsRedirect() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const router = useRouter()
  useEffect(() => {
    if (workspaceId) router.replace(`/workspaces/${workspaceId}/boards`)
  }, [workspaceId, router])
  return null
}
