"use client"

import CalendarPage from '@/page-components/CalendarPage'
import { SectionGuard } from '@/components/permissions/SectionGuard'

export default function CalendarRoute() {
  return (
    <SectionGuard permission="view_calendar">
      <CalendarPage />
    </SectionGuard>
  )
}
