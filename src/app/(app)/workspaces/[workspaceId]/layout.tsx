/**
 * Workspace-уровень layout. Server Component — делает первичную
 * проверку доступа к воркспейсу до рендера клиентских компонентов.
 *
 * Проверки:
 *  - сессия есть (родительский (app)/layout.tsx уже это гарантирует, но
 *    тут берём user_id через getUser для проверки participant'а);
 *  - у юзера есть participant в этом workspace с `is_deleted = false`
 *    и `can_login = true`. Иначе — редирект на `/workspaces` с маркером.
 *
 * Это закрывает кейс «менеджер заблокировал участника, но access-token
 * у того ещё живой» — на любом server-render запросе layout вернёт
 * редирект независимо от того, что лежит в JWT.
 *
 * Импersonированные сессии: владелец стартует импersonацию только под
 * активным participant'ом (RPC start_impersonation_session проверяет
 * can_login=true), поэтому здесь дополнительной ветки не нужно.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { WorkspaceLayoutClient } from './WorkspaceLayoutClient'

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const { workspaceId } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('id, can_login, is_deleted')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participant || participant.is_deleted || !participant.can_login) {
    redirect(`/workspaces?blocked=${workspaceId}`)
  }

  // Блокировка воркспейса целиком (админка платформы). SECURITY DEFINER RPC —
  // не зависит от RLS на workspaces. При блокировке все участники видят
  // заглушку на /workspaces независимо от живых access-token'ов.
  const { data: suspended } = await supabase.rpc('is_workspace_suspended', {
    p_workspace_id: workspaceId,
  })
  if (suspended === true) {
    redirect(`/workspaces?suspended=${workspaceId}`)
  }

  return <WorkspaceLayoutClient>{children}</WorkspaceLayoutClient>
}
