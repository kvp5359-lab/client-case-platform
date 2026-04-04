"use client"

import { WorkspaceProvider } from '@/contexts/WorkspaceContext'

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>
}
