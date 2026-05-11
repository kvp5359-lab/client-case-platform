import type { createSupabaseServiceClient } from '@/lib/supabase-service'

export type ServiceClient = ReturnType<typeof createSupabaseServiceClient>

export type ResendEvent = {
  type: string
  created_at?: string
  data: ResendEmailData
}

export type ResendEmailData = {
  id?: string
  email_id?: string
  from?: string | { email: string; name?: string }
  to?: string[] | { email: string; name?: string }[]
  cc?: string[] | { email: string; name?: string }[]
  subject?: string
  text?: string
  html?: string
  /** Resend для inbound кладёт Message-ID как top-level поле, не только в headers. */
  message_id?: string
  in_reply_to?: string
  references?: string | string[]
  headers?: { name: string; value: string }[] | Record<string, string>
  attachments?: {
    filename?: string
    content_type?: string
    /** Base64 content (если Resend отдаёт inline). */
    content?: string
    /** URL для скачивания, если Resend отдаёт файлы отдельно. */
    url?: string
    /** Resend API v2 может класть base64 под path. */
    path?: string
    size?: number
  }[]
  spam_score?: number
}

export type Resolution = {
  workspace_id: string | null
  workspace_slug: string | null
  resolution_type: string
  thread_id: string | null
  project_id: string | null
  virtual_address_id: string | null
  routing_mode: string | null
  target_project_id: string | null
  target_thread_id: string | null
  default_thread_template_id: string | null
  default_assignee_user_id: string | null
  auto_reply_enabled: boolean | null
  auto_reply_text: string | null
  resolved_email_account_id: string | null
  resolved_user_id: string | null
}

export const ROOT_DOMAIN = 'clientcase.app'
