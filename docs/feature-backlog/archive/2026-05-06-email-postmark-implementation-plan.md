# Email — детальный план реализации (гибридная модель)

**Дата:** 2026-05-06 (v3 — гибридная)
**Связано с:** [`2026-05-04-email-postmark-internal-addresses.md`](./2026-05-04-email-postmark-internal-addresses.md) (исходное ТЗ).
**Статус:** план реализации, готов к старту.

---

## 0. Главная архитектурная модель

**Принцип:** клиент может писать в сервис **двумя способами одновременно**. Сотрудник выбирает что предпочтительнее в каждом конкретном случае.

### Канал A — Planfix-style (через подключённый ящик сотрудника)

```
client@example.com  ←→  ivan@petrov-firma.com  ←→  ClientCase
                              ↓ forward rule
                        inbox@rs.clientcase.app  →  Postmark  →  тред
```

**Когда использовать:** личное общение юрист ↔ клиент. Клиент видит настоящий адрес сотрудника, история переписки сохраняется в его обычном ящике.

### Канал B — прямой адрес сервиса

```
client@example.com  ──────────────→  t+15@rs.clientcase.app  →  Postmark  →  тред 15
                                     p+3@rs.clientcase.app   →  Postmark  →  проект 3
                                     support@rs.clientcase.app →  Postmark  →  правило
```

**Когда использовать:**
- Постоянный «адрес дела» который не зависит от смены сотрудника
- Брендовые адреса (`support@`, `info@`) для входа клиента «с улицы»
- Системные уведомления (платёжки, документы) от лица сервиса

### Оба канала объединяются в одном Postmark и в одной таблице

Postmark принимает на любой адрес поддомена `<slug>.clientcase.app`. Мы парсим To:
- `inbox@` → матчинг через In-Reply-To / References / From → тред
- `t+<short>@` → прямой резолв через `project_threads.short_id` → тред
- `p+<short>@` → прямой резолв через `projects.short_id` → создать тред в проекте
- `<custom>@` (например, `support@`) → правило из `email_virtual_addresses`

### Отправка — два метода на выбор

Каждый исходящий из ClientCase письмом: `email_send_method`:

- **`employee_mailbox`** — отправка через подключённый Gmail/SMTP сотрудника. From = его настоящий адрес. **Дефолт когда есть подключённый ящик.**
- **`system_postmark`** — отправка через Postmark с From `t+15@rs.clientcase.app`. Дефолт когда у сотрудника нет подключённого ящика, либо при системных нотификациях.

В UI композера — toggle «Отправить от:» с двумя опциями.

### Преимущества гибридной модели

🟢 **Гибкость** — сотрудник выбирает «личное» (свой адрес) или «брендовое» (адрес сервиса).

🟢 **Постоянство адреса** — `t+15@` живёт пока живёт тред, даже если сотрудник уволился.

🟢 **Provider-agnostic** — можно подключать любую почту: Gmail (OAuth), Yandex/корп (SMTP).

🟢 **Откат простой** — выключил forward → Planfix-канал отвалился, остальное работает.

---

## 1. Архитектура — компоненты

### 1.1 Подключение ящика сотрудника (для канала A)

Каждый сотрудник в воркспейсе **может** подключить свой почтовый ящик.

**Способы:**
1. **Gmail OAuth** — уже есть в проекте (`gmail-auth`, `gmail-callback`). Расширяем UX.
2. **SMTP login + IMAP login** — для Yandex/Mail.ru/корп. Логин, пароль, host:port.
3. **(Будущее) Microsoft 365 OAuth** — отложено.

**Хранение:** существующая таблица `email_accounts` расширяется (см. миграцию ниже).

**Forward setup для Gmail OAuth — автоматический**: после OAuth мы через Gmail API сами добавляем forwarding rule, перехватываем confirmation-письмо в нашем Postmark webhook, парсим код, подтверждаем.

**Для SMTP — вручную**: показываем инструкцию для конкретного провайдера.

### 1.2 Postmark — приём + опциональная отправка

**Postmark Server `clientcase-prod`:**
- **Inbound webhook**: один URL `https://my.clientcase.app/_internal/postmark-webhook` принимает всё.
- **Sender Domain `<slug>.clientcase.app`**: добавлен через API при активации воркспейса. Используется для:
  - Inbound (приём писем на любой адрес поддомена)
  - Outbound (отправка с `t+<short>@`, `p+<short>@`, `<virtual>@`)

**API ключ** в Supabase secrets как `POSTMARK_SERVER_TOKEN`.

### 1.3 Резолв входящего письма

Postmark парсит и шлёт нам payload. Алгоритм маршрутизации:

1. **Если To = `t+<N>@<slug>.clientcase.app`** → прямо в тред с `short_id=N`.
2. **Если To = `p+<N>@<slug>.clientcase.app`** → проект с `short_id=N`:
   - Найти существующий тред с этим From → положить туда
   - Иначе создать новый тред
3. **Если To = `<virtual>@<slug>.clientcase.app`** → правило из `email_virtual_addresses` (create_thread / append_existing / fixed_thread).
4. **Если To = `inbox@<slug>.clientcase.app`** → forward от сотрудника:
   - **Извлечь оригинального отправителя** из MIME (Reply-To или forwarded body)
   - Match через RPC `match_inbound_email`:
     - По `In-Reply-To` (отвечает на наше)
     - По `References`
     - По From + recent activity
   - Если ничего не сматчилось → `email_inbound_unmatched`
5. **Если ничего не подошло** → `email_inbound_unmatched`, нотификация менеджеру.

### 1.4 Адресация поддомена

```
inbox@rs.clientcase.app          ← forward-цель из ящика сотрудника (Planfix-style)
t+<N>@rs.clientcase.app          ← прямой адрес треда #N
p+<N>@rs.clientcase.app          ← прямой адрес проекта #N
support@rs.clientcase.app        ← виртуальный (созданный юзером)
hh@rs.clientcase.app             ← виртуальный
*@rs.clientcase.app              ← всё остальное → unmatched
```

Все эти адреса работают на одном MX-сервере (Postmark inbound), один webhook на всё.

---

## 2. Изменения в БД

### 2.1 Миграция `20260506_email_hybrid_setup.sql`

```sql
-- ============================================================
-- Гибридная email-модель: подключённые ящики (Canal A) + Postmark direct (Canal B)
-- ============================================================

-- 1. Расширяем enum
ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'email_internal';

-- 2. Расширяем email_accounts для SMTP-ящиков и forward-настроек
ALTER TABLE email_accounts
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

-- 3. Workspace-level — Postmark domain status
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS email_postmark_domain_id text,
  ADD COLUMN IF NOT EXISTS email_dkim_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_return_path_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_mx_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_activated_at timestamptz;

-- 4. Project_threads — поля для email
ALTER TABLE project_threads
  ADD COLUMN IF NOT EXISTS email_send_account_id uuid REFERENCES email_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_send_method text NOT NULL DEFAULT 'auto'
    CHECK (email_send_method IN ('auto', 'employee_mailbox', 'system_postmark')),
  ADD COLUMN IF NOT EXISTS email_subject_root text,
  ADD COLUMN IF NOT EXISTS email_last_external_address text;

-- 5. Project_messages — поля для email_internal
ALTER TABLE project_messages
  ADD COLUMN IF NOT EXISTS email_message_id text,
  ADD COLUMN IF NOT EXISTS email_in_reply_to text,
  ADD COLUMN IF NOT EXISTS email_references text[],
  ADD COLUMN IF NOT EXISTS email_raw_mime_path text,
  ADD COLUMN IF NOT EXISTS email_postmark_id text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_send_account_id uuid REFERENCES email_accounts(id),
  ADD COLUMN IF NOT EXISTS email_send_method text
    CHECK (email_send_method IS NULL OR email_send_method IN ('employee_mailbox', 'system_postmark')),
  ADD COLUMN IF NOT EXISTS email_delivery_status text
    CHECK (email_delivery_status IS NULL OR email_delivery_status IN
      ('queued', 'sent', 'delivered', 'bounced', 'complaint', 'opened', 'clicked', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_messages_email_message_id
  ON project_messages(email_message_id) WHERE email_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_messages_email_in_reply_to
  ON project_messages(email_in_reply_to) WHERE email_in_reply_to IS NOT NULL;

-- 6. Виртуальные адреса (опциональная фича для брендовых сценариев)
CREATE TABLE IF NOT EXISTS email_virtual_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  local_part text NOT NULL,
  display_name text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  routing_mode text NOT NULL DEFAULT 'create_thread'
    CHECK (routing_mode IN ('create_thread', 'append_existing', 'fixed_thread')),
  target_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  target_thread_id uuid REFERENCES project_threads(id) ON DELETE SET NULL,
  default_thread_template_id uuid REFERENCES thread_templates(id),
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

ALTER TABLE email_virtual_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_virtual_addresses_select ON email_virtual_addresses
  FOR SELECT USING (is_workspace_participant(workspace_id, auth.uid()));
CREATE POLICY email_virtual_addresses_modify ON email_virtual_addresses
  FOR ALL USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

-- 7. Нераспознанные письма
CREATE TABLE IF NOT EXISTS email_inbound_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  raw_mime_path text NOT NULL,
  postmark_id text,
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] NOT NULL,
  cc_addresses text[],
  subject text,
  message_id_header text,
  in_reply_to text,
  references_headers text[],
  original_to text,                                      -- для forward-цепочек: оригинальный адрес
  received_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_thread_id uuid REFERENCES project_threads(id) ON DELETE SET NULL,
  spam_score numeric
);

ALTER TABLE email_inbound_unmatched ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_inbound_unmatched_select ON email_inbound_unmatched
  FOR SELECT USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));
CREATE POLICY email_inbound_unmatched_update ON email_inbound_unmatched
  FOR UPDATE USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

CREATE INDEX idx_email_inbound_unmatched_workspace_unresolved
  ON email_inbound_unmatched(workspace_id, received_at DESC) WHERE resolved_at IS NULL;

-- 8. Workspace email settings
CREATE TABLE IF NOT EXISTS workspace_email_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
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

ALTER TABLE workspace_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_email_settings_select ON workspace_email_settings
  FOR SELECT USING (is_workspace_participant(workspace_id, auth.uid()));
CREATE POLICY workspace_email_settings_modify ON workspace_email_settings
  FOR ALL USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));
```

### 2.2 RPC `resolve_inbound_email_address` (полный с учётом всех типов)

```sql
CREATE OR REPLACE FUNCTION public.resolve_inbound_email_address(p_address text)
RETURNS TABLE (
  workspace_id uuid,
  workspace_slug text,
  resolution_type text,                 -- 'thread' | 'project' | 'virtual' | 'inbox' | 'unknown_local' | 'unknown_workspace'
  thread_id uuid,
  project_id uuid,
  virtual_address_id uuid,
  routing_mode text,
  target_project_id uuid,
  target_thread_id uuid,
  default_thread_template_id uuid,
  default_assignee_user_id uuid,
  auto_reply_enabled boolean,
  auto_reply_text text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local text := lower(split_part(p_address, '@', 1));
  v_domain text := lower(split_part(p_address, '@', 2));
  v_root_domain text := 'clientcase.app';
  v_slug text;
  v_workspace_id uuid;
  v_short_id int;
BEGIN
  -- Резолв slug
  IF v_domain LIKE '%.' || v_root_domain THEN
    v_slug := substring(v_domain FROM 1 FOR length(v_domain) - length(v_root_domain) - 1);
    SELECT w.id INTO v_workspace_id FROM workspaces w
      WHERE w.slug = v_slug AND w.is_deleted = false LIMIT 1;
  ELSE
    -- custom_domain (если воркспейс подключил свой)
    SELECT w.id, w.slug INTO v_workspace_id, v_slug
    FROM workspaces w WHERE w.custom_domain = v_domain AND w.is_deleted = false LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_slug, 'unknown_workspace'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text;
    RETURN;
  END IF;

  -- 1. inbox@... — forward от сотрудника
  IF v_local = 'inbox' THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'inbox'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text;
    RETURN;
  END IF;

  -- 2. t+<N>@... — конкретный тред
  IF v_local ~ '^t\+[0-9]+$' THEN
    v_short_id := substring(v_local FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'thread'::text,
        pt.id, pt.project_id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text
      FROM project_threads pt
      WHERE pt.workspace_id = v_workspace_id AND pt.short_id = v_short_id;
    RETURN;
  END IF;

  -- 3. p+<N>@... — проект
  IF v_local ~ '^p\+[0-9]+$' THEN
    v_short_id := substring(v_local FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'project'::text,
        NULL::uuid, p.id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text
      FROM projects p
      WHERE p.workspace_id = v_workspace_id AND p.short_id = v_short_id AND p.is_deleted = false;
    RETURN;
  END IF;

  -- 4. Виртуальный адрес (support@, hh@, leads@...)
  RETURN QUERY
    SELECT v_workspace_id, v_slug, 'virtual'::text,
      NULL::uuid, NULL::uuid, ev.id, ev.routing_mode,
      ev.target_project_id, ev.target_thread_id,
      ev.default_thread_template_id, ev.default_assignee_user_id,
      ev.auto_reply_enabled, ev.auto_reply_text
    FROM email_virtual_addresses ev
    WHERE ev.workspace_id = v_workspace_id
      AND ev.local_part = v_local
      AND ev.is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'unknown_local'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_inbound_email_address(text) TO service_role;
```

### 2.3 RPC `match_inbound_email` (для канала A — forward-режима)

```sql
-- Для resolution_type='inbox' нужен дополнительный матчинг,
-- т.к. адрес-получатель не указывает на конкретный тред.
CREATE OR REPLACE FUNCTION public.match_inbound_email(
  p_workspace_id uuid,
  p_from_address text,
  p_in_reply_to text,
  p_references text[]
)
RETURNS TABLE (
  thread_id uuid,
  project_id uuid,
  match_method text                     -- 'in_reply_to' | 'references' | 'from_recent' | 'none'
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread_id uuid;
  v_project_id uuid;
BEGIN
  -- 1. По In-Reply-To
  IF p_in_reply_to IS NOT NULL THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = p_in_reply_to
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'in_reply_to'::text;
      RETURN;
    END IF;
  END IF;

  -- 2. По References
  IF p_references IS NOT NULL AND array_length(p_references, 1) > 0 THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id AND pm.email_message_id = ANY(p_references)
    ORDER BY pm.created_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'references'::text;
      RETURN;
    END IF;
  END IF;

  -- 3. По From + recent activity (90 дней)
  SELECT pt.id, pt.project_id INTO v_thread_id, v_project_id
  FROM project_threads pt
  WHERE pt.workspace_id = p_workspace_id
    AND pt.email_last_external_address = p_from_address
    AND pt.is_deleted = false
    AND pt.updated_at > now() - interval '90 days'
  ORDER BY pt.updated_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_thread_id, v_project_id, 'from_recent'::text;
    RETURN;
  END IF;

  -- 4. Не нашли
  RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'none'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_inbound_email(uuid, text, text, text[]) TO service_role;
```

### 2.4 RPC `get_thread_email_address` (для UI)

```sql
CREATE OR REPLACE FUNCTION public.get_thread_email_address(p_thread_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_short_id int;
  v_workspace_slug text;
  v_email_active boolean;
BEGIN
  SELECT pt.short_id, w.slug, w.email_active
  INTO v_short_id, v_workspace_slug, v_email_active
  FROM project_threads pt
  JOIN workspaces w ON w.id = pt.workspace_id
  WHERE pt.id = p_thread_id;

  IF v_short_id IS NULL OR v_workspace_slug IS NULL OR NOT v_email_active THEN
    RETURN NULL;
  END IF;

  RETURN 't+' || v_short_id || '@' || v_workspace_slug || '.clientcase.app';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_email_address(uuid) TO authenticated;
```

### 2.5 Триггер исходящих

```sql
CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  -- Skip входящих/служебных
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event',
                    'telegram_business', 'telegram_mtproto', 'wazzup',
                    'email', 'email_internal') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN RETURN NEW; END IF;
  IF NEW.has_attachments = true THEN RETURN NEW; END IF;

  -- ВЕТКА: email_internal
  -- (если у треда есть email-история ИЛИ привязан send_account)
  IF NEW.thread_id IS NOT NULL THEN
    DECLARE
      v_send_account_id uuid;
      v_is_email boolean;
    BEGIN
      SELECT pt.email_send_account_id,
        (pt.email_send_account_id IS NOT NULL OR EXISTS (
          SELECT 1 FROM project_messages
          WHERE thread_id = NEW.thread_id
            AND source = 'email_internal'
            AND email_message_id IS NOT NULL
          LIMIT 1
        ))
      INTO v_send_account_id, v_is_email
      FROM project_threads pt WHERE pt.id = NEW.thread_id;

      IF v_is_email THEN
        PERFORM net.http_post(
          url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
          body := jsonb_build_object('message_id', NEW.id),
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-internal-secret', '...'
          )
        );
        RETURN NEW;
      END IF;
    END;
  END IF;

  -- ... [остальные ветки telegram/wazzup как раньше] ...

  RETURN NEW;
END;
$function$;
```

---

## 3. Edge Functions

### 3.1 `postmark-webhook` — единый приём

**Где:** Next.js API route `src/app/api/postmark-webhook/route.ts` (Node runtime для `mailparser`).

**Защита:** Basic Auth.

**Псевдокод:**

```typescript
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // 1. Auth check (Basic Auth header)
  // 2. Parse Postmark payload, decode RawEmail
  const parsed = await simpleParser(rawEmail)

  // 3. Дедуп по Message-ID
  // 4. Save raw MIME в Storage

  // 5. Резолв адреса получателя
  const toAddress = parsed.to?.value[0]?.address
  const { data: resolution } = await supabase.rpc('resolve_inbound_email_address', {
    p_address: toAddress,
  }).single()

  if (!resolution || resolution.resolution_type === 'unknown_workspace') {
    return ok()  // не наш — игнорируем
  }

  let threadId: string | null = null
  let projectId: string | null = null
  const fromAddress = parsed.from?.value[0]?.address

  switch (resolution.resolution_type) {
    case 'thread':
      // Прямой адрес t+<N>@ — сразу знаем тред
      threadId = resolution.thread_id
      projectId = resolution.project_id
      break

    case 'project':
      // p+<N>@ — найти thread по From или создать новый
      const { data: existingThread } = await supabase
        .from('project_threads')
        .select('id')
        .eq('project_id', resolution.project_id)
        .eq('email_last_external_address', fromAddress)
        .eq('is_deleted', false)
        .maybeSingle()
      if (existingThread) {
        threadId = existingThread.id
      } else {
        // Создать новый тред в проекте
        const { data: newThread } = await supabase.from('project_threads').insert({
          project_id: resolution.project_id,
          workspace_id: resolution.workspace_id,
          name: parsed.subject ?? `Email от ${fromAddress}`,
          type: 'chat',
          email_subject_root: parsed.subject,
          email_last_external_address: fromAddress,
        }).select('id').single()
        threadId = newThread!.id
      }
      projectId = resolution.project_id
      break

    case 'virtual':
      // Виртуальный адрес — применить routing_mode
      // ... аналогично project, но с правилом из virtual_addresses
      break

    case 'inbox':
      // Forward от сотрудника — извлечь оригинального отправителя из MIME
      const realFrom = extractOriginalFrom(parsed) ?? { address: fromAddress }

      // Match через RPC
      const { data: match } = await supabase.rpc('match_inbound_email', {
        p_workspace_id: resolution.workspace_id,
        p_from_address: realFrom.address,
        p_in_reply_to: parsed.inReplyTo,
        p_references: parsed.references,
      }).single()

      if (match.match_method !== 'none') {
        threadId = match.thread_id
        projectId = match.project_id
      } else {
        // Не нашли — в unmatched
        await saveUnmatched({...})
        return ok()
      }
      break

    case 'unknown_local':
      await saveUnmatched({...})
      return ok()
  }

  // 6. INSERT project_messages (одинаково для всех каналов)
  const { data: msg } = await supabase.from('project_messages').insert({
    thread_id: threadId,
    project_id: projectId,
    workspace_id: resolution.workspace_id,
    source: 'email_internal',
    content: parsed.html ?? parsed.text ?? '',
    sender_name: parsed.from?.value[0]?.name ?? fromAddress,
    sender_role: 'Email',
    has_attachments: (parsed.attachments?.length ?? 0) > 0,
    email_message_id: parsed.messageId,
    email_in_reply_to: parsed.inReplyTo,
    email_references: parsed.references,
    email_subject: parsed.subject,
    email_raw_mime_path: rawPath,
    email_postmark_id: payload.MessageID,
  }).select('id').single()

  // 7. Загрузка вложений + обновить thread.email_last_external_address
  return ok()
}

/**
 * extractOriginalFrom: извлекает оригинального отправителя из forwarded MIME.
 * Стратегия:
 * 1. Если Reply-To !== From и Reply-To не наш inbox — берём Reply-To.
 * 2. Иначе парсим тело forwarded-блока (regex по «From: <address>»).
 * 3. Иначе fallback на From.
 *
 * Стартуем с Gmail (универсальный формат). Для Yandex/Outlook — добавляем по мере необходимости.
 */
```

### 3.2 `email-internal-send` — выбор метода отправки

**Где:** Supabase Edge Function `--no-verify-jwt`, защита `x-internal-secret`.

**Псевдокод:**

```typescript
Deno.serve(async (req) => {
  if (!await requireInternalSecret(req)) return jsonRes({ error: 'Unauthorized' }, 401)
  const { message_id } = await req.json()

  // 1. Загрузить сообщение + контекст
  const { data: msg } = await supabase.from('project_messages').select(`
    id, thread_id, content, sender_name,
    email_send_account_id, email_send_method, email_subject, email_in_reply_to, email_references,
    project_threads (email_subject_root, email_last_external_address, email_send_account_id, email_send_method, short_id),
    workspaces (slug, email_active),
    message_attachments (file_name, mime_type, storage_path)
  `).eq('id', message_id).single()

  // 2. Определить method
  // Priority: message-level → thread-level → workspace default → 'employee_mailbox' if account else 'system_postmark'
  const sendMethod = msg.email_send_method
    ?? msg.project_threads.email_send_method
    ?? (msg.email_send_account_id ?? msg.project_threads.email_send_account_id ? 'employee_mailbox' : 'system_postmark')

  // 3. Подготовить общие поля
  const toAddress = msg.project_threads.email_last_external_address
  const subject = msg.project_threads.email_subject_root
    ? `Re: ${msg.project_threads.email_subject_root}`
    : msg.email_subject
  const safeHtml = sanitizeAndInlineStyles(msg.content)
  const messageIdHeader = `<${crypto.randomUUID()}@<домен по методу>>`

  // 4. Развилка по методу отправки
  if (sendMethod === 'employee_mailbox') {
    const sendAccountId = msg.email_send_account_id ?? msg.project_threads.email_send_account_id
    const { data: account } = await supabase.from('email_accounts')
      .select('*').eq('id', sendAccountId).single()

    if (account.auth_type === 'gmail_oauth') {
      await sendViaGmail({ account, to, subject, html, attachments, messageIdHeader, ... })
    } else if (account.auth_type === 'smtp_password') {
      await sendViaSmtp({ account, to, subject, html, attachments, messageIdHeader, ... })
    }
  } else {
    // system_postmark — отправка через Postmark API с From t+<short>@...
    const fromAddress = `t+${msg.project_threads.short_id}@${msg.workspaces.slug}.clientcase.app`
    const attachmentsB64 = await prepareAttachmentsBase64(msg.message_attachments)

    const postmarkRes = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': Deno.env.get('POSTMARK_SERVER_TOKEN'),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        From: `"${msg.sender_name}" <${fromAddress}>`,
        ReplyTo: fromAddress,
        To: toAddress,
        Subject: subject,
        HtmlBody: safeHtml,
        TextBody: htmlToPlainText(safeHtml),
        Headers: [
          { Name: 'Message-ID', Value: messageIdHeader },
          ...(msg.email_in_reply_to ? [{ Name: 'In-Reply-To', Value: msg.email_in_reply_to }] : []),
          ...(msg.email_references?.length ? [{ Name: 'References', Value: msg.email_references.join(' ') }] : []),
        ],
        Attachments: attachmentsB64,
      }),
    })
    // ... обработать ответ
  }

  // 5. Сохранить идентификаторы
  await supabase.from('project_messages').update({
    email_message_id: messageIdHeader,
    email_send_method: sendMethod,
    email_delivery_status: 'sent',
  }).eq('id', message_id)

  return jsonRes({ ok: true })
})
```

### 3.3 `email-bounce-webhook` — статусы доставки

Postmark Bounce/SpamComplaint/Open/Click events. Обновляет `email_delivery_status`. Нужен только для канала B (system_postmark) — для канала A (employee_mailbox) bounce приходит на ящик сотрудника отдельно.

### 3.4 Расширение `provision-domain`: type='email'

Добавляет `<slug>.clientcase.app` как Sender Domain в Postmark, настраивает DNS (MX + DKIM + SPF + Return-Path) через Cloudflare API. Опрашивает Postmark пока не verified, обновляет `workspaces.email_active=true`.

### 3.5 `connect-email-account` — подключение ящика сотрудника

Новая Edge Function:
- Gmail OAuth: возвращает auth_url для редиректа
- SMTP: принимает host/port/credentials, тестирует подключение
- При успехе создаёт запись в `email_accounts`
- **Auto-setup forward для Gmail OAuth**:
  - Через Gmail API добавляет `inbox@<slug>.clientcase.app` как forwarding address
  - Перехватывает confirmation code в нашем postmark-webhook
  - Подтверждает forward через Gmail API
  - Включает forward
  - Status: pending_verification → verified

---

## 4. Расширение клиентского кода

### 4.1 messengerService

```typescript
// При has_attachments — вызвать email-internal-send для email-тредов
if (hasAnyAttachments && params.threadId) {
  const { data: thread } = await supabase
    .from('project_threads')
    .select('email_send_account_id, email_send_method')
    .eq('id', params.threadId).maybeSingle()

  // Тред считается email-каналом если есть send_account ИЛИ есть email-сообщения
  const isEmailThread = thread?.email_send_account_id || /* проверка на email-историю */
  if (isEmailThread) {
    supabase.functions.invoke('email-internal-send', {
      body: { message_id: message.id, attachments_only: true },
    }).catch((err) => logger.error('Email send failed:', err))
  }
}
```

### 4.2 UI: «Подключить почту» в профиле

`/profile/email` (новая страница):

```
Подключённые ящики:

▸ ivan@petrov-firma.com (Gmail)
  ✓ Forward активен
  Подпись: [Текст подписи...]
  [Отключить]

▸ sales@petrov-firma.com (SMTP yandex.ru)
  ⚠ Forward не настроен
  [Показать инструкцию по настройке]

[+ Подключить Gmail]   [+ Подключить SMTP-ящик]
```

### 4.3 UI: вкладка «Email» в IntegrationsTab воркспейса

Owner видит:
- **Активация Postmark**: статус DKIM/SPF/MX/Active. Кнопка «Активировать» если ещё нет.
- **Inbox-адрес воркспейса**: `inbox@rs.clientcase.app` (с кнопкой копирования) — для forward'ов.
- **Дефолт метод отправки**: select 'employee_mailbox' / 'system_postmark' / 'auto'.
- **Подключённые ящики сотрудников**: read-only обзор.
- **Виртуальные адреса**: CRUD.
- **Нераспознанные письма**: счётчик + ссылка.

### 4.4 UI: композер для email-тредов

Когда тред — email (есть `email_internal` сообщения или активный send_account):

```
[Тема: ____________]  ← только для первого письма

[ HTML-композер ]

От: 🔘 ivan@petrov-firma.com (мой Gmail)        ← дефолт если есть подключённый
    ⚪ t+15@rs.clientcase.app (адрес треда)      ← опция

[Отправить]  [Прикрепить]
```

### 4.5 UI: индикатор email в шапке треда

```
📧 Email активен
   Адрес треда:    t+15@rs.clientcase.app   [📋 Скопировать]
   Адрес проекта:  p+3@rs.clientcase.app    [📋]
   Контакт:        client@example.com       (последний отправитель)
```

### 4.6 Раздел «Нераспознанные письма»

Страница `/workspaces/[id]/inbox/unmatched` — для менеджеров:
- Список писем из `email_inbound_unmatched` без `resolved_at`
- Действия: «Привязать к треду» (поиск треда), «Создать тред в проекте», «Удалить как спам»

---

## 5. Безопасность

1. **SMTP-пароли** — шифрование через pg_sodium. Расшифровка только в Edge Function.
2. **Postmark webhook** — Basic Auth.
3. **HTML-санитизация** — DOMPurify (входящие при рендере, исходящие при отправке).
4. **Rate limiting** — на отправку: 200 писем/мин на воркспейс.
5. **Storage** — bucket `email-raw-mime` приватный, signed URLs только участникам.
6. **RLS** — `email_accounts` доступен только владельцу + менеджерам, пароли не возвращаются клиенту.
7. **Антиспам** — Postmark проставляет `SpamScore`, при превышении порога → trash.

---

## 6. Phase breakdown

### Phase 0 — Postmark setup (1 час)
- [ ] Регистрация, Server, Tokens в Supabase secrets.

### Phase 1 — БД (0.5 дня)
- [ ] Миграция `20260506_email_hybrid_setup.sql`.
- [ ] RPC `resolve_inbound_email_address`, `match_inbound_email`, `get_thread_email_address`.
- [ ] Расширение триггера.

### Phase 2 — Provision: type='email' (1 день)
- [ ] `/opt/clientcase-provision/provision.sh` — команда `email-setup <slug>`.
- [ ] Postmark API + Cloudflare API.
- [ ] Edge Function `provision-domain` ветка email.

### Phase 3 — Postmark webhook (1.5 дня)
- [ ] `src/app/api/postmark-webhook/route.ts`.
- [ ] Helper `extractOriginalFrom` для Gmail-forward'ов.
- [ ] Маршрутизация через `resolve_inbound_email_address` + `match_inbound_email`.
- [ ] Тест: forward из личного Gmail + прямой email на `t+1@`.

### Phase 4 — Подключение ящика (2 дня)
- [ ] Расширение `email_accounts` (через миграцию в Phase 1).
- [ ] Edge Function `connect-email-account` (OAuth + SMTP).
- [ ] Refactor `gmail-send` → shared `sendViaGmail`.
- [ ] Реализация `sendViaSmtp` через nodemailer.
- [ ] UI «Мои ящики» в профиле.

### Phase 5 — Auto-setup forward (1 день)
- [ ] Gmail API: добавление + verification forward'а.
- [ ] Перехват confirmation code в postmark-webhook.

### Phase 6 — `email-internal-send` с обоими методами (1 день)
- [ ] Edge Function с веткой employee_mailbox vs system_postmark.
- [ ] Frontend invoke в messengerService для attachments.

### Phase 7 — Bounce webhook (0.5 дня)
- [ ] `email-bounce-webhook` для системных нотификаций (только канал B).

### Phase 8 — UI треда и настроек (2-3 дня)
- [ ] Композер с полем Subject и toggle «От».
- [ ] Индикатор email-канала в шапке треда.
- [ ] Раздел «Нераспознанные письма».
- [ ] Виртуальные адреса CRUD.
- [ ] Активация email на воркспейсе.

### Phase 9 — SMTP-инструкции (0.5 дня)
- [ ] Готовые инструкции для Yandex, Mail.ru, корп.

**Итого: ~10-11 рабочих дней.**

---

## 7. Открытые вопросы

1. **Forward-адрес: один на воркспейс или per-employee?**
   Один (`inbox@<slug>.clientcase.app`). Сотрудника определяем из From-заголовка. Если нужно изолировать — потом добавим `inbox+<employee_id>@`.

2. **SMTP без OAuth — как хранить пароли?**
   Через pg_sodium. Рекомендуем юзерам app-passwords (Yandex, Yahoo, Apple).

3. **IMAP в дополнение к SMTP?**
   Да — для копирования Sent в папку «Отправленные» сотрудника. Без этого в Gmail ящике не будет видно отправленных через ClientCase писем.

4. **Cc / Bcc?**
   Сохраняем все адреса. В композере — чекбокс «Ответить всем».

5. **Дубли при forward + прямой адрес одновременно**
   Дедуп через unique индекс на `email_message_id`.

6. **Bounce при отправке через employee_mailbox**
   Bounce приходит на ящик сотрудника → forward'ится → попадает в наш webhook → можно распарсить и пометить `email_delivery_status='bounced'`. Edge case, не критично на старте.

7. **Subject у первого письма из сервиса**
   Если в композере не введён → модалка «введите тему».

8. **Headers `Auto-Submitted`** для auto-reply — добавлять, чтобы не было петель.

---

## 8. Метрики успеха

- ✅ 95%+ ответов клиентов автоматически попадают в правильный тред.
- ✅ Прямой адрес (t+/p+/virtual) — 100% попадают в правильный тред (адрес однозначен).
- ✅ Доставляемость через employee_mailbox — равна штатной (через Gmail/SMTP сотрудника).
- ✅ Доставляемость через system_postmark — ≥ 98%.
- ✅ Подключение нового ящика ≤ 5 мин (включая forward).
- ✅ Активация email на воркспейсе ≤ 10 мин (DNS-верификация).

---

## 9. Что НЕ делаем в этой итерации

- ❌ Custom-домены клиентов для email.
- ❌ Маркетинговые рассылки.
- ❌ PGP/S/MIME.
- ❌ Полнотекстовый поиск.
- ❌ CRM-карточки контактов из email.
- ❌ Microsoft 365 OAuth.
- ❌ Шаблоны исходящих писем.
- ❌ Multi-user inbox (общий ящик с распределением между сотрудниками).

---

## 10. Готовность

Документ покрывает гибридную модель:
- ✅ Канал A — Planfix-style через подключённые ящики
- ✅ Канал B — прямые адреса (t+/p+/virtual) через Postmark
- ✅ Полные SQL-миграции
- ✅ Все RPC с подробной логикой резолва и матчинга
- ✅ Псевдокод обоих edge functions с обработкой всех типов адресов
- ✅ Phase breakdown с конкретными задачами
- ✅ 8 открытых вопросов

**Готов начать с Phase 0 после OK.**
