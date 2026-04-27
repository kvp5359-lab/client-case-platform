/**
 * Layout auth-группы (login, register, callback).
 *
 * Server Component: если пользователь уже авторизован — редиректит на /app
 * (который подбирает последний открытый или первый доступный воркспейс).
 * Defense-in-depth: middleware тоже может это делать, но layout гарантирует
 * на уровне SSR, что залогиненный пользователь не увидит форму входа.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  // getUser() валидирует JWT (а не просто читает куку, как getSession()).
  // Согласовано с /app/page.tsx — иначе при просроченном токене получаем
  // петлю /app → /login → /app: getSession видит куку, getUser её отвергает.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/app')
  }

  return <>{children}</>
}
