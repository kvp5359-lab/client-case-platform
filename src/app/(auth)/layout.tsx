/**
 * Layout auth-группы (login, register, callback).
 *
 * Server Component: если пользователь уже авторизован — редиректит на /profile.
 * Defense-in-depth: middleware тоже может это делать, но layout гарантирует
 * на уровне SSR, что залогиненный пользователь не увидит форму входа.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session) {
    redirect('/profile')
  }

  return <>{children}</>
}
