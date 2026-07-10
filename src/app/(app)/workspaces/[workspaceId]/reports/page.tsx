"use client"
import ReportsPage from '@/page-components/ReportsPage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function ReportsRoute() {
  return (
    <SectionGuard permission="view_reports">
      <ReportsPage />
    </SectionGuard>
  )
}
