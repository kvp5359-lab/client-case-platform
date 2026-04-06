"use client"

/**
 * Клиентские провайдеры — обёртка для всего приложения
 */

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { DismissAllToasts } from '@/components/DismissAllToasts'

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      },
    },
  })

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient)

  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        visibleToasts={5}
        expand
        offset={16}
        style={{ '--width': '356px' } as React.CSSProperties}
      />
      <DismissAllToasts />
      <ErrorBoundary title="Ошибка приложения" fullPageReload>
        <AuthProvider>{children}</AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}
