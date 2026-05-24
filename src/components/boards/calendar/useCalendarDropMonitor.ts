"use client"

/**
 * @dnd-kit useDndMonitor для календарной сетки на доске: превью под курсором
 * при drag из обычных board-листов, ставит start_at/end_at при drop.
 * Фильтрует события по droppableId (на доске может быть несколько календарей).
 */

import { useState, type Dispatch, type SetStateAction } from 'react'
import { useDndMonitor } from '@dnd-kit/core'
import type { View } from 'react-big-calendar'
import {
  findDaySlotAtPoint,
  computeTimeFromCoords,
  pxPerMinute,
  getMinHourFromGutter,
} from './coordsToTime'
import { useUpdateThreadTime } from '@/hooks/useCalendarThreads'
import type { WorkspaceTask } from '@/hooks/tasks/useWorkspaceThreads'

export type PreviewRect = {
  left: number
  width: number
  top: number
  height: number
  startLabel: string
  title: string
  accent: string
} | null

type Refs = {
  tasksRef: { current: WorkspaceTask[] }
  viewRef: { current: View }
  dateRef: { current: Date }
}

export function useCalendarDropMonitor(
  droppableId: string,
  workspaceId: string,
  refs: Refs,
): { previewRect: PreviewRect; setPreviewRect: Dispatch<SetStateAction<PreviewRect>> } {
  const [previewRect, setPreviewRect] = useState<PreviewRect>(null)
  const updateTime = useUpdateThreadTime()

  useDndMonitor({
    onDragMove: (e) => {
      const overId = e.over ? String(e.over.id) : null
      if (overId !== droppableId) {
        if (previewRect) setPreviewRect(null)
        return
      }
      const act = e.activatorEvent as unknown as { clientX?: number; clientY?: number }
      const x = (act?.clientX ?? 0) + e.delta.x
      const y = (act?.clientY ?? 0) + e.delta.y
      const slot = findDaySlotAtPoint(x, y)
      if (!slot) {
        if (previewRect) setPreviewRect(null)
        return
      }
      const time = computeTimeFromCoords(x, y, refs.viewRef.current, refs.dateRef.current, slot)
      if (!time) return
      const rect = slot.getBoundingClientRect()
      const ppm = pxPerMinute(slot)
      const dayStartMin = getMinHourFromGutter(slot) * 60
      const offsetMin = time.getHours() * 60 + time.getMinutes() - dayStartMin
      const top = rect.top + offsetMin * ppm
      const height = Math.max(8, 30 * ppm)
      const activeId = String(e.active.id)
      const taskId = activeId.startsWith('task:') ? activeId.split(':')[1] : ''
      const task = refs.tasksRef.current.find((t) => t.id === taskId)
      setPreviewRect({
        left: rect.left,
        width: rect.width,
        top,
        height,
        startLabel: `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`,
        title: task?.name ?? '',
        accent: task?.accent_color ?? 'blue',
      })
    },
    onDragEnd: (e) => {
      const overId = e.over ? String(e.over.id) : null
      setPreviewRect(null)
      if (overId !== droppableId) return
      const activeId = String(e.active.id)
      if (!activeId.startsWith('task:')) return
      const taskId = activeId.split(':')[1]
      if (!taskId) return
      const act = e.activatorEvent as unknown as { clientX?: number; clientY?: number }
      const x = (act?.clientX ?? 0) + e.delta.x
      const y = (act?.clientY ?? 0) + e.delta.y
      const slot = findDaySlotAtPoint(x, y)
      if (!slot) return
      const time = computeTimeFromCoords(x, y, refs.viewRef.current, refs.dateRef.current, slot)
      if (!time) return
      const task = refs.tasksRef.current.find((t) => t.id === taskId)
      const end = new Date(time.getTime() + 30 * 60 * 1000)
      updateTime.mutate({
        threadId: taskId,
        projectId: task?.project_id ?? null,
        workspaceId: task?.workspace_id ?? workspaceId,
        start_at: time.toISOString(),
        end_at: end.toISOString(),
      })
    },
    onDragCancel: () => setPreviewRect(null),
  })

  return { previewRect, setPreviewRect }
}
