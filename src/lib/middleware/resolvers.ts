/**
 * RPC-резолверы для Next-middleware (proxy.ts). Все обращения к Supabase
 * REST/RPC из middleware идут через эти функции — один паттерн fetch,
 * один места ошибок и таймаутов.
 *
 * Все RPC объявлены SECURITY DEFINER + GRANT EXECUTE TO anon, поэтому
 * нужен только anon-ключ.
 */

type WorkspaceRow = {
  id: string
  slug: string | null
  custom_domain: string | null
}

function getEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) return null
  return { url, anonKey }
}

async function callRpc<T>(rpcName: string, body: unknown): Promise<T | null> {
  try {
    const env = getEnv()
    if (!env) return null
    const res = await fetch(`${env.url}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * Резолв воркспейса по host через RPC.
 */
export async function resolveWorkspaceByHost(host: string): Promise<WorkspaceRow | null> {
  const cleanHost = host.split(':')[0].toLowerCase()
  const data = await callRpc<WorkspaceRow[]>('resolve_workspace_by_host', { p_host: cleanHost })
  if (!Array.isArray(data) || data.length === 0) return null
  const row = data[0]
  return { id: row.id, slug: row.slug, custom_domain: row.custom_domain }
}

/**
 * Резолв воркспейса по UUID. Legacy-редиректы со старого
 * /workspaces/<uuid>/... → <slug>.clientcase.app/...
 */
export async function getWorkspaceById(workspaceId: string): Promise<WorkspaceRow | null> {
  const data = await callRpc<WorkspaceRow[]>('get_workspace_slug_by_id', { p_id: workspaceId })
  if (!Array.isArray(data) || data.length === 0) return null
  const row = data[0]
  return { id: row.id, slug: row.slug, custom_domain: row.custom_domain }
}

/**
 * Обратный резолв: UUID → short_id. Для редиректа /projects/<uuid> → /projects/<short>.
 */
export async function getShortIdByUuid(
  entityType: 'project' | 'thread' | 'board',
  uuid: string,
): Promise<number | null> {
  const data = await callRpc<unknown>('get_short_id_by_uuid', {
    p_entity_type: entityType,
    p_uuid: uuid,
  })
  if (typeof data === 'number') return data
  return null
}

/**
 * Резолв short_id → UUID для коротких ссылок (как у Planfix: /projects/15).
 */
export async function resolveShortId(
  workspaceId: string,
  entityType: 'project' | 'thread' | 'board',
  shortId: number,
): Promise<string | null> {
  const data = await callRpc<unknown>('resolve_short_id', {
    p_workspace_id: workspaceId,
    p_entity_type: entityType,
    p_short_id: shortId,
  })
  if (typeof data === 'string') return data
  return null
}
