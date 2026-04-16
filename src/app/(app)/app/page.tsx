/**
 * /app — landing после логина.
 *
 * Server Component: выбирает куда отправить пользователя после авторизации:
 * 1. last_workspace_id из user_settings — если пользователь всё ещё в нём участник
 * 2. иначе первый активный workspace, где пользователь — участник
 * 3. иначе /workspaces (страница со списком / создание нового)
 *
 * Используется как дефолт после Google OAuth / Email OTP / Email+Password.
 * `/profile` оставлен как страница профиля, на которую заходят вручную.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'

export default async function AppLandingRoute() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const email = user.email?.toLowerCase()
  if (!email) {
    redirect('/workspaces')
  }

  // Параллельно: last_workspace_id + доступные воркспейсы (через participants)
  const [settingsRes, participantsRes] = await Promise.all([
    supabase.from('user_settings').select('last_workspace_id').eq('user_id', user.id).maybeSingle(),
    supabase
      .from('participants')
      .select('workspace_id, workspaces:workspace_id(id, is_deleted)')
      .eq('email', email)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false }),
  ])

  const accessibleIds = new Set<string>()
  for (const p of participantsRes.data ?? []) {
    const ws = p.workspaces as { id: string; is_deleted: boolean } | null
    if (ws && !ws.is_deleted) accessibleIds.add(ws.id)
  }

  const lastId = settingsRes.data?.last_workspace_id as string | null | undefined
  if (lastId && accessibleIds.has(lastId)) {
    redirect(`/workspaces/${lastId}`)
  }

  const firstId = accessibleIds.values().next().value
  if (firstId) {
    redirect(`/workspaces/${firstId}`)
  }

  redirect('/workspaces')
}
