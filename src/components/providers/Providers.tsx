"use client"

/**
 * Клиентские провайдеры — обёртка для всего приложения
 */

import { ReactNode, useState } from 'react'
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { DismissAllToasts } from '@/components/DismissAllToasts'
import { PerfSinkRegistrar } from '@/components/providers/PerfSinkRegistrar'
import { STALE_TIME, GC_TIME } from '@/hooks/queryKeys'
import { isImpersonationWriteError } from '@/lib/impersonation'

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: STALE_TIME.LONG,
        gcTime: GC_TIME.LONG,
      },
    },
    // В режиме impersonation любые DML отбиваются БД-триггером. Это нормально —
    // пользователь сидит как «зритель», и фоновых мутаций (mark-as-read,
    // last-viewed и т.п.) при открытии треда легко набирается пачка. Тосты
    // об этом — шум: верхний баннер уже объясняет, что режим read-only.
    // Поэтому здесь молча гасим ошибку, чтобы дальше она не пробрасывалась.
    mutationCache: new MutationCache({
      onError: (err) => {
        if (isImpersonationWriteError(err)) {
          // no-op
        }
      },
    }),
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
      <PerfSinkRegistrar />
      <ErrorBoundary title="Ошибка приложения" fullPageReload>
        <AuthProvider>{children}</AuthProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  )
}
