"use client"

import { Suspense } from 'react'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen">
          <p className="text-muted-foreground">Загрузка...</p>
        </div>
      }
    >
      <ProtectedRoute>
        <div className="max-w-[1700px] mx-auto w-full shadow-[0_0_40px_rgba(0,0,0,0.06)]">
          {children}
        </div>
      </ProtectedRoute>
    </Suspense>
  )
}
