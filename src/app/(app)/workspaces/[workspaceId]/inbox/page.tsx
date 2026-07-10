"use client"

import InboxPage from '@/page-components/InboxPage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function InboxRoute() {
  return (
    <SectionGuard permission="view_inbox">
      <InboxPage />
    </SectionGuard>
  )
}
