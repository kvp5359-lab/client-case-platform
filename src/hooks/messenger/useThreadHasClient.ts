"use client"

/**
 * Определяет, есть ли в треде участник проекта с проектной ролью «Клиент».
 *
 * Клиентский тред = тред, к которому имеет доступ хотя бы один клиент. По
 * этому флагу мессенджер подсвечивает сообщения от сотрудников (кольцо
 * аватара + левая полоса бабла), чтобы команда визуально отличалась от
 * клиента.
 *
 * Делегирует пакетному хуку `useProjectClientThreadIds` — единый алгоритм
 * с режимом «Вся история» (там тот же расчёт нужен сразу для всех тредов
 * проекта).
 */

import { useMemo } from 'react'
import type { ProjectThread } from '@/hooks/messenger/useProjectThreads'
import { useProjectClientThreadIds } from '@/hooks/messenger/useProjectClientThreadIds'

export function useThreadHasClient(thread: ProjectThread | null | undefined): boolean {
  const threads = useMemo(() => (thread ? [thread] : []), [thread])
  const set = useProjectClientThreadIds(thread?.project_id ?? undefined, threads)
  return thread ? set.has(thread.id) : false
}
