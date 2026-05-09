-- ============================================================
-- Email (Resend) — гибридная модель
-- Канал A: подключённые ящики сотрудников (Gmail OAuth / SMTP)
-- Канал B: прямые адреса <slug>.clientcase.app (через Resend inbound)
-- ============================================================

-- 1. email_accounts — расширение для SMTP-ящиков и forward-настроек
ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'gmail_oauth'
    CHECK (auth_type IN ('gmail_oauth', 'smtp_password', 'microsoft_oauth')),
  ADD COLUMN IF NOT EXISTS smtp_host text,
  ADD COLUMN IF NOT EXISTS smtp_port int,
  ADD COLUMN IF NOT EXISTS smtp_username text,
  ADD COLUMN IF NOT EXISTS smtp_password_encrypted bytea,
  ADD COLUMN IF NOT EXISTS smtp_use_tls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port int,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS forward_setup_status text NOT NULL DEFAULT 'not_setup'
    CHECK (forward_setup_status IN ('not_setup', 'pending_verification', 'verified', 'broken')),
  ADD COLUMN IF NOT EXISTS forward_target_address text,
  ADD COLUMN IF NOT EXISTS forward_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_html text;

-- 2. workspaces — Resend domain status + email_active flag
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS email_resend_domain_id text,
  ADD COLUMN IF NOT EXISTS email_dkim_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_return_path_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_mx_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_activated_at timestamptz;

-- 3. project_threads — поля для email-канала
ALTER TABLE public.project_threads
  ADD COLUMN IF NOT EXISTS email_send_account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_send_method text NOT NULL DEFAULT 'auto'
    CHECK (email_send_method IN ('auto', 'employee_mailbox', 'system_postmark')),
  ADD COLUMN IF NOT EXISTS email_subject_root text,
  ADD COLUMN IF NOT EXISTS email_last_external_address text;

-- 4. project_messages — поля для email_internal
ALTER TABLE public.project_messages
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS email_in_reply_to text,
  ADD COLUMN IF NOT EXISTS email_references text[],
  ADD COLUMN IF NOT EXISTS email_raw_mime_path text,
  ADD COLUMN IF NOT EXISTS email_resend_id text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_send_account_id uuid REFERENCES public.email_accounts(id),
  ADD COLUMN IF NOT EXISTS email_send_method text
    CHECK (email_send_method IS NULL OR email_send_method IN ('employee_mailbox', 'system_postmark')),
  ADD COLUMN IF NOT EXISTS email_delivery_status text
    CHECK (email_delivery_status IS NULL OR email_delivery_status IN
      ('queued', 'sent', 'delivered', 'bounced', 'complaint', 'opened', 'clicked', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_messages_email_message_id
  ON public.project_messages(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_messages_email_in_reply_to
  ON public.project_messages(email_in_reply_to) WHERE email_in_reply_to IS NOT NULL;

-- 5. email_virtual_addresses — брендовые / роль-адреса (support@, hh@, leads@…)
CREATE TABLE IF NOT EXISTS public.email_virtual_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  local_part text NOT NULL,
  display_name text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  routing_mode text NOT NULL DEFAULT 'create_thread'
    CHECK (routing_mode IN ('create_thread', 'append_existing', 'fixed_thread')),
  target_project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  target_thread_id uuid REFERENCES public.project_threads(id) ON DELETE SET NULL,
  default_thread_template_id uuid REFERENCES public.thread_templates(id),
  default_assignee_user_id uuid REFERENCES auth.users(id),
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  auto_reply_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (workspace_id, local_part),
  CHECK (local_part ~ '^[a-z0-9]([a-z0-9._-]{0,28}[a-z0-9])?$'),
  CHECK (local_part NOT IN ('inbox', 't', 'p', 'admin', 'noreply', 'postmaster', 'mailer-daemon'))
);

ALTER TABLE public.email_virtual_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_virtual_addresses_select ON public.email_virtual_addresses;
CREATE POLICY email_virtual_addresses_select ON public.email_virtual_addresses
  FOR SELECT USING (public.is_workspace_participant(workspace_id, auth.uid()));

DROP POLICY IF EXISTS email_virtual_addresses_modify ON public.email_virtual_addresses;
CREATE POLICY email_virtual_addresses_modify ON public.email_virtual_addresses
  FOR ALL USING (public.has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

-- 6. email_inbound_unmatched — нераспознанные письма
CREATE TABLE IF NOT EXISTS public.email_inbound_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  raw_mime_path text NOT NULL,
  resend_id text,
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] NOT NULL,
  cc_addresses text[],
  subject text,
  message_id_header text,
  in_reply_to text,
  references_headers text[],
  original_to text,
  received_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_thread_id uuid REFERENCES public.project_threads(id) ON DELETE SET NULL,
  spam_score numeric
);

ALTER TABLE public.email_inbound_unmatched ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_inbound_unmatched_select ON public.email_inbound_unmatched;
CREATE POLICY email_inbound_unmatched_select ON public.email_inbound_unmatched
  FOR SELECT USING (public.has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

DROP POLICY IF EXISTS email_inbound_unmatched_update ON public.email_inbound_unmatched;
CREATE POLICY email_inbound_unmatched_update ON public.email_inbound_unmatched
  FOR UPDATE USING (public.has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

CREATE INDEX IF NOT EXISTS idx_email_inbound_unmatched_workspace_unresolved
  ON public.email_inbound_unmatched(workspace_id, received_at DESC) WHERE resolved_at IS NULL;

-- 7. workspace_email_settings
CREATE TABLE IF NOT EXISTS public.workspace_email_settings (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  inbox_address text,
  reply_quote_style text NOT NULL DEFAULT 'gmail'
    CHECK (reply_quote_style IN ('gmail', 'outlook', 'minimal', 'none')),
  signature_html text,
  notify_managers_on_unmatched boolean NOT NULL DEFAULT true,
  default_send_method text NOT NULL DEFAULT 'employee_mailbox'
    CHECK (default_send_method IN ('employee_mailbox', 'system_postmark', 'auto')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_email_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workspace_email_settings_select ON public.workspace_email_settings;
CREATE POLICY workspace_email_settings_select ON public.workspace_email_settings
  FOR SELECT USING (public.is_workspace_participant(workspace_id, auth.uid()));

DROP POLICY IF EXISTS workspace_email_settings_modify ON public.workspace_email_settings;
CREATE POLICY workspace_email_settings_modify ON public.workspace_email_settings
  FOR ALL USING (public.has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));
