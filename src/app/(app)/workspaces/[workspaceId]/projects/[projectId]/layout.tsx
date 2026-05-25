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
 *
 * Edge-case при редиректе из-за RLS: если в URL есть `?panelTab=thread:<id>`
 * и тред *доступен* пользователю (через `project_thread_members` / роли —
 * `can_user_access_thread`), то теряя pathname проекта мы теряем и
 * shareable-ссылку на тред. Поэтому перед редиректом проверяем тред и,
 * если доступ к нему есть, редиректим на нейтральный `/inbox?panelTab=…`,
 * где `TaskPanelTabbedShell` (смонтирован в `WorkspaceLayout`) откроет
 * панель. Стандартный путь без panelTab остался прежним — на список
 * проектов воркспейса.
 */

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { ProjectProvider } from '@/contexts/ProjectContext'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Резолв `?panelTab=thread:<short|uuid>` в полноценный UUID треда. */
async function resolveThreadFromPanelTab(
  supabase: SupabaseClient,
  workspaceId: string,
  panelTab: string,
): Promise<string | null> {
  if (!panelTab.startsWith('thread:')) return null
  const ref = panelTab.slice('thread:'.length)
  if (/^\d+$/.test(ref)) {
    const { data } = await supabase.rpc('resolve_short_id', {
      p_workspace_id: workspaceId,
      p_entity_type: 'thread',
      p_short_id: parseInt(ref, 10),
    })
    return (data as string | null) ?? null
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) {
    return ref
  }
  return null
}

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
    // Перед редиректом — проверяем, есть ли в URL ссылка на тред, к которому
    // у пользователя ЕСТЬ доступ (хотя на проект нет). Если есть — сохраняем
    // panelTab при редиректе на нейтральный pathname.
    const h = await headers()
    const xUrl = h.get('x-url')
    if (xUrl) {
      try {
        const url = new URL(xUrl)
        const panelTab = url.searchParams.get('panelTab')
        if (panelTab) {
          const threadUuid = await resolveThreadFromPanelTab(supabase, workspaceId, panelTab)
          if (threadUuid) {
            const { data: thread } = await supabase
              .from('project_threads')
              .select('id')
              .eq('id', threadUuid)
              .maybeSingle()
            if (thread) {
              redirect(`/workspaces/${workspaceId}/inbox?panelTab=${encodeURIComponent(panelTab)}`)
            }
          }
        }
      } catch {
        // битый x-url — игнор, fallback на стандартный редирект
      }
    }
    redirect(`/workspaces/${workspaceId}/projects`)
  }

  return <ProjectProvider>{children}</ProjectProvider>
}
