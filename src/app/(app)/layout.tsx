/**
 * Layout приватной части приложения.
 *
 * Server Component: проверяет сессию через Supabase SSR и делает
 * server-side redirect на /login — без flash "Загрузка..." на клиенте.
 * Middleware тоже проверяет сессию; этот layout — defense-in-depth
 * на случай, если запрос попал в route мимо middleware (например,
 * через prefetch/streaming), плюс он даёт Next.js 16 возможность
 * отрендерить HTML через SSR.
 *
 * Клиентская защита остаётся в ProtectedRoute (редирект с сохранением
 * auth_redirect в localStorage) — для navigate-after-login UX.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ProtectedRoute } from '@/components/auth/ProtectedRoute'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  return (
    <ProtectedRoute>
      <div className="max-w-[1700px] mx-auto w-full shadow-[0_0_40px_rgba(0,0,0,0.06)]">
        {children}
      </div>
    </ProtectedRoute>
  )
}
