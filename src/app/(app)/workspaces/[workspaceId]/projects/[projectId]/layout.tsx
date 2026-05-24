/**
 * Project-уровень layout. Server Component — делает первичную проверку
 * доступа к проекту до рендера клиентских компонентов.
 *
 * Проверки:
 *  - сессия есть (родительский (app)/layout.tsx уже это гарантирует, но
 *    тут берём user_id через getUser);
 *  - SELECT по `projects` под RLS отдаёт строку (значит политика пропускает),
 *    проект принадлежит этому workspace и не в корзине. Иначе — редирект
 *    на список проектов воркспейса.
 *
 * Закрывает информационный leak: до этой правки layout был пустым,
 * структура страницы (имя проекта, табы) могла отрендериться даже если
 * клиентские RPC-вызовы потом вернули бы 403.
 */

import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ProjectProvider } from '@/contexts/ProjectContext'

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string; projectId: string }>
}) {
  const { workspaceId, projectId } = await params
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, is_deleted')
    .eq('id', projectId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!project || project.is_deleted) {
    redirect(`/workspaces/${workspaceId}/projects`)
  }

  return <ProjectProvider>{children}</ProjectProvider>
}
