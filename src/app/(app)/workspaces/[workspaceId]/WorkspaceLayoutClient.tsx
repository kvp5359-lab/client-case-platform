"use client"

import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { WorkspaceLayoutShell } from '@/components/WorkspaceLayout'
import { AccentThemeStyle } from '@/components/AccentThemeStyle'

export function WorkspaceLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <AccentThemeStyle />
      <WorkspaceLayoutShell>{children}</WorkspaceLayoutShell>
    </WorkspaceProvider>
  )
}
