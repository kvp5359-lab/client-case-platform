"use client"

import { Suspense } from 'react'
import { AuthCallbackPage } from '@/page-components/AuthCallbackPage'

function Loader() {
  return (
    <div className="flex items-center justify-center h-screen">
      <p className="text-muted-foreground">Загрузка...</p>
    </div>
  )
}

export default function AuthCallbackRoute() {
  return (
    <Suspense fallback={<Loader />}>
      <AuthCallbackPage />
    </Suspense>
  )
}
