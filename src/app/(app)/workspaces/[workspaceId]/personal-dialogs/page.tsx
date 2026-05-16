"use client"

/**
 * Backward-compat редирект: `/personal-dialogs` → `/tasks?filter=no_project`.
 *
 * Старая страница «Личные диалоги» (мессенджер только с чатами без проекта)
 * заменена унифицированной страницей «Без проекта» (TasksPage с фильтром,
 * показывает И чаты, И задачи без project_id). Сохраняем редирект, чтобы
 * существующие закладки/глубокие ссылки не ломались.
 */

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function PersonalDialogsRoute() {
  const router = useRouter()
  const { workspaceId } = useParams<{ workspaceId: string }>()

  useEffect(() => {
    if (workspaceId) {
      router.replace(`/workspaces/${workspaceId}/tasks?filter=no_project`)
    }
  }, [router, workspaceId])

  return null
}
