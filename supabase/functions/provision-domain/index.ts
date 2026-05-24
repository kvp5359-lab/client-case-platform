/**
 * provision-domain — Edge Function для автопровижининга SSL и nginx-конфига.
 *
 * Вызывается из UI (DomainSettingsTab) при подключении custom-домена или
 * автоматически при создании воркспейса (через trigger или client-side hook).
 *
 * Сценарии:
 *  - type=subdomain: добавить <slug>.clientcase.app в общий cert
 *  - type=custom:    выпустить отдельный cert + nginx-блок для своего домена клиента
 *  - type=verify:    проверить что DNS клиента указывает на наш IP
 *
 * Вся работа делается через провижининг-сервис на VPS (HTTPS endpoint
 * /_internal/provision на my.clientcase.app, защищён shared-secret'ом).
 *
 * Требует прав: только владелец воркспейса (проверяется через service-role клиент
 * + workspace_id из payload). UPDATE статуса в БД делает service-role.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeadersFor } from "../_shared/edge.ts"

const PROVISION_URL = Deno.env.get('PROVISION_SERVICE_URL') ?? 'https://my.clientcase.app/_internal/provision'
const PROVISION_SECRET = Deno.env.get('PROVISION_SECRET') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

interface RequestBody {
  workspace_id: string
  type: 'subdomain' | 'custom' | 'verify'
  domain?: string  // для custom + verify
  force?: boolean
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req)
  const jsonResponse = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405)

  if (!PROVISION_SECRET) {
    return jsonResponse({ error: 'PROVISION_SECRET not configured' }, 500)
  }

  // Получаем JWT юзера для проверки владельца
  const authHeader = req.headers.get('authorization')
  if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

  // Парсим body
  let body: RequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const { workspace_id, type, domain } = body
  if (!workspace_id || !type) return jsonResponse({ error: 'workspace_id and type required' }, 400)

  // Проверяем что юзер — владелец воркспейса
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data: ws, error: wsErr } = await serviceClient
    .from('workspaces')
    .select('id, slug, custom_domain')
    .eq('id', workspace_id)
    .single()
  if (wsErr || !ws) return jsonResponse({ error: 'Workspace not found' }, 404)

  // Проверка прав через RPC is_workspace_owner
  const { data: isOwner } = await serviceClient.rpc('is_workspace_owner', {
    p_workspace_id: workspace_id,
    p_user_id: user.id,
  })
  if (!isOwner) return jsonResponse({ error: 'Forbidden' }, 403)

  const slug = ws.slug
  if (!slug) return jsonResponse({ error: 'Workspace has no slug' }, 400)

  // Готовим payload для VPS-сервиса
  let provisionBody: Record<string, string>
  if (type === 'subdomain') {
    provisionBody = { type: 'subdomain', slug }
  } else if (type === 'custom') {
    if (!domain) return jsonResponse({ error: 'domain required for custom' }, 400)
    provisionBody = { type: 'custom', domain, slug }
  } else if (type === 'verify') {
    if (!domain) return jsonResponse({ error: 'domain required for verify' }, 400)
    provisionBody = { type: 'verify', domain }
  } else {
    return jsonResponse({ error: 'Unknown type' }, 400)
  }

  // Вызываем VPS-сервис
  const provRes = await fetch(PROVISION_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PROVISION_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(provisionBody),
  })

  const provData = await provRes.json().catch(() => ({}))

  // Обновляем статус в БД для custom-домена
  if (type === 'custom' && provRes.ok) {
    await serviceClient
      .from('workspaces')
      .update({
        custom_domain_status: 'active',
        custom_domain_verified_at: new Date().toISOString(),
      })
      .eq('id', workspace_id)
  } else if (type === 'custom' && !provRes.ok) {
    await serviceClient
      .from('workspaces')
      .update({ custom_domain_status: 'failed' })
      .eq('id', workspace_id)
  }

  return jsonResponse({
    ok: provRes.ok,
    type,
    output: provData.output ?? null,
    error: provData.error ?? null,
  }, provRes.ok ? 200 : 500)
})
