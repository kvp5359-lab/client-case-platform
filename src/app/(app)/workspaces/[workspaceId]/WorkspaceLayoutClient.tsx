"use client"

import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { WorkspaceLayoutShell } from '@/components/WorkspaceLayout'
import { AccentThemeStyle } from '@/components/AccentThemeStyle'
import { PlatformAnnouncementBanner } from '@/components/PlatformAnnouncementBanner'

export function WorkspaceLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <AccentThemeStyle />
      <PlatformAnnouncementBanner />
      <WorkspaceLayoutShell>{children}</WorkspaceLayoutShell>
    </WorkspaceProvider>
  )
}
