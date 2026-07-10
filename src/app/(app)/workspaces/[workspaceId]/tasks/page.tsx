"use client"

import TasksPage from '@/page-components/TasksPage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function TasksRoute() {
  return (
    <SectionGuard permission="view_tasks_page">
      <TasksPage />
    </SectionGuard>
  )
}
