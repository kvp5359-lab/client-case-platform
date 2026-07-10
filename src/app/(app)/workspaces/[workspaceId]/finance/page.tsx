"use client"
import WorkspaceFinancePage from '@/page-components/WorkspaceFinancePage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function WorkspaceFinanceRoute() {
  return (
    <SectionGuard permission="view_finance">
      <WorkspaceFinancePage />
    </SectionGuard>
  )
}
