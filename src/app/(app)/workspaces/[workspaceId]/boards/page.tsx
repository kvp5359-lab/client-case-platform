"use client"

import BoardsPage from '@/page-components/BoardsPage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function BoardsRoute() {
  return (
    <SectionGuard permission="view_boards">
      <BoardsPage />
    </SectionGuard>
  )
}
