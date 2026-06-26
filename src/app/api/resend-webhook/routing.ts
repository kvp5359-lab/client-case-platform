import type { Resolution, ServiceClient } from './types'

/**
 * Дефолтные иконка+цвет нового email-чата из workspaces.channel_defaults
 * (через SQL-хелпер resolve_channel_default — единый источник фолбэков).
 */
async function resolveEmailDefault(
  supabase: ServiceClient,
  workspaceId: string,
): Promise<{ icon: string; accent_color: string }> {
  const { data } = await supabase.rpc('resolve_channel_default', {
    p_workspace_id: workspaceId,
    p_channel_key: 'email',
  })
  const r = Array.isArray(data) ? data[0] : data
  return {
    icon: (r?.icon as string) ?? 'mail',
    accent_color: (r?.accent_color as string) ?? 'rose',
  }
}

/**
 * Создаёт новый тред в проекте — без поиска существующего. Используется
 * для p+<id>@: каждое письмо клиента на адрес проекта = новое обращение.
 */
export async function createNewThreadInProject(
  supabase: ServiceClient,
  opts: {
    workspaceId: string
    projectId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string }> {
  // Считаем sort_order чтобы новый тред оказался в конце списка проекта
  // (как делает useProjectThreads при ручном создании). Без этого default=0
  // и треды толкаются в начало вперемешку.
  const { data: maxRow } = await supabase
    .from('project_threads')
    .select('sort_order')
    .eq('project_id', opts.projectId)
    .eq('is_deleted', false)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = ((maxRow as { sort_order: number | null } | null)?.sort_order ?? 0) + 10

  const def = await resolveEmailDefault(supabase, opts.workspaceId)

  const { data: created, error } = await supabase
    .from('project_threads')
    .insert({
      project_id: opts.projectId,
      workspace_id: opts.workspaceId,
      name: opts.subject?.trim() || `Email от ${opts.fromAddress}`,
      type: 'email',
      icon: def.icon,
      accent_color: def.accent_color,
      sort_order: nextSortOrder,
      email_subject_root: opts.subject ?? null,
      email_last_external_address: opts.fromAddress,
    })
    .select('id')
    .single()
  if (error || !created) throw error ?? new Error('create_thread_failed')
  return { threadId: created.id }
}

/**
 * Ищет существующий тред в проекте по from-адресу, иначе создаёт новый.
 * Используется виртуальными адресами с routing_mode='append_existing'.
 */
async function ensureThreadInProject(
  supabase: ServiceClient,
  opts: {
    workspaceId: string
    projectId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string }> {
  const { data: existing } = await supabase
    .from('project_threads')
    .select('id')
    .eq('project_id', opts.projectId)
    .eq('email_last_external_address', opts.fromAddress)
    .eq('is_deleted', false)
    .maybeSingle()
  if (existing) return { threadId: existing.id }
  return createNewThreadInProject(supabase, opts)
}

export async function applyVirtualRouting(
  supabase: ServiceClient,
  opts: {
    resolution: Resolution
    workspaceId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string | null; projectId: string | null }> {
  const { resolution, workspaceId } = opts
  if (resolution.routing_mode === 'fixed_thread' && resolution.target_thread_id) {
    const { data: thread } = await supabase
      .from('project_threads')
      .select('id, project_id')
      .eq('id', resolution.target_thread_id)
      .maybeSingle()
    if (thread) return { threadId: thread.id, projectId: thread.project_id }
  }

  const targetProjectId = resolution.target_project_id ?? null
  if (!targetProjectId) {
    return { threadId: null, projectId: null }
  }

  if (resolution.routing_mode === 'append_existing') {
    const { data: existing } = await supabase
      .from('project_threads')
      .select('id')
      .eq('project_id', targetProjectId)
      .eq('email_last_external_address', opts.fromAddress)
      .eq('is_deleted', false)
      .maybeSingle()
    if (existing) return { threadId: existing.id, projectId: targetProjectId }
  }

  const result = await ensureThreadInProject(supabase, {
    workspaceId,
    projectId: targetProjectId,
    fromAddress: opts.fromAddress,
    subject: opts.subject,
  })
  return { threadId: result.threadId, projectId: targetProjectId }
}

/**
 * Создаёт новый тред «Личные email-диалоги» сотрудника без проекта
 * (`project_id = NULL`, `owner_user_id = userId`). Используется
 * для inbox+<localpart>@: каждый клиент = новый тред.
 */
export async function ensurePersonalEmailThread(
  supabase: ServiceClient,
  opts: {
    workspaceId: string
    accountId: string
    fromAddress: string
    subject: string | null
  },
): Promise<{ threadId: string; projectId: string | null }> {
  const { data: account } = await supabase
    .from('email_accounts')
    .select('user_id')
    .eq('id', opts.accountId)
    .maybeSingle()
  if (!account) throw new Error('email account not found')
  const userId = (account as { user_id: string }).user_id

  // Находим/создаём контакт в справочнике участников по email-адресу.
  const { data: contactId } = await supabase.rpc('find_or_create_contact_participant', {
    p_workspace_id: opts.workspaceId,
    p_name: opts.fromAddress,
    p_email: opts.fromAddress,
  })

  const def = await resolveEmailDefault(supabase, opts.workspaceId)

  const { data: created, error } = await supabase
    .from('project_threads')
    .insert({
      project_id: null,
      owner_user_id: userId,
      contact_participant_id: (contactId as string | null) ?? null,
      workspace_id: opts.workspaceId,
      name: opts.subject?.trim() || `Email от ${opts.fromAddress}`,
      type: 'email',
      icon: def.icon,
      accent_color: def.accent_color,
      email_subject_root: opts.subject ?? null,
      email_last_external_address: opts.fromAddress,
      email_send_account_id: opts.accountId,
      email_send_method: 'employee_mailbox',
      created_by: userId,
    })
    .select('id')
    .single()
  if (error || !created) throw error ?? new Error('create personal email thread failed')
  return { threadId: created.id, projectId: null }
}

export async function saveUnmatched(
  supabase: ServiceClient,
  opts: {
    workspaceId: string
    resendId: string | null
    fromAddress: string
    fromName: string | null
    toAddresses: string[]
    ccAddresses: string[]
    subject: string | null
    messageIdHeader: string | null
    inReplyTo: string | null
    references: string[]
    originalTo: string
    reason: string
    spamScore: number | null
  },
) {
  await supabase.from('email_inbound_unmatched').insert({
    workspace_id: opts.workspaceId,
    raw_mime_path: opts.resendId ? `resend:${opts.resendId}` : 'resend:unknown',
    resend_id: opts.resendId,
    from_address: opts.fromAddress,
    from_name: opts.fromName,
    to_addresses: opts.toAddresses,
    cc_addresses: opts.ccAddresses.length ? opts.ccAddresses : null,
    subject: opts.subject,
    message_id_header: opts.messageIdHeader,
    in_reply_to: opts.inReplyTo,
    references_headers: opts.references.length ? opts.references : null,
    original_to: opts.originalTo,
    reason: opts.reason,
    spam_score: opts.spamScore,
  })
}
