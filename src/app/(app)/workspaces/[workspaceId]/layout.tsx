"use client"

import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { WorkspaceLayoutShell } from '@/components/WorkspaceLayout'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <WorkspaceLayoutShell>{children}</WorkspaceLayoutShell>
    </WorkspaceProvider>
  )
}
