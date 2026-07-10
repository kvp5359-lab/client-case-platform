"use client"

import SourceUpdatesPage from '@/page-components/SourceUpdatesPage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function SourceUpdatesRoute() {
  return (
    <SectionGuard permission="view_source_updates">
      <SourceUpdatesPage />
    </SectionGuard>
  )
}
