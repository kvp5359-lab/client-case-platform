# Email — детальный план реализации (Planfix-модель)

**Дата:** 2026-05-06
**Связано с:** [`2026-05-04-email-postmark-internal-addresses.md`](./2026-05-04-email-postmark-internal-addresses.md) (исходное ТЗ — общая концепция).
**Статус:** план реализации, готов к старту по фазам.

---

## 0. Главная архитектурная модель (Planfix-style)

**Принцип:** клиент общается с сотрудником через **обычную рабочую почту сотрудника** (`ivan@petrov-firma.com`). Клиент даже не знает, что между ними есть какой-то сервис.

```
        КЛИЕНТ                       СОТРУДНИК                       СЕРВИС
client@example.com  ←→  ivan@petrov-firma.com  ←→  rs.clientcase.app
                                  ↓                          ↑
                              forward rule  ──→  inbox@rs.clientcase.app
                                                          ↓
                                                       Postmark
                                                          ↓
                                                       парсим
                                                          ↓
                                                       тред
```

### Два потока

#### Исходящий (от сотрудника к клиенту)

1. Сотрудник пишет ответ в треде в ClientCase.
2. ClientCase отправляет письмо **через подключённый ящик сотрудника** (Gmail API или SMTP).
3. Клиент получает письмо «От: Иван Иванов <ivan@petrov-firma.com>».
4. Копия письма автоматически сохраняется в «Отправленных» сотрудника (стандартное поведение Gmail/SMTP).

#### Входящий (от клиента к сотруднику)

1. Клиент отвечает на привычный `ivan@petrov-firma.com`.
2. У сотрудника настроен **forward** в почте: всё пересылается на `inbox@rs.clientcase.app`.
3. Postmark принимает forward, шлёт нам JSON.
4. Мы парсим, ищем тред по `In-Reply-To` (или по `From`), кладём сообщение туда.

### Чем это отличается от моей первой версии плана

| Раньше (от 2026-05-06 v1) | Теперь (Planfix-style) |
|---------------------------|------------------------|
| Клиент пишет на `t+15@rs.clientcase.app` напрямую | Клиент пишет на `ivan@petrov-firma.com` как обычно |
| Postmark = и приём, и отправка | Postmark = **только приём** (через forward) |
| Отправка с домена `*.clientcase.app` | Отправка через **подключённый ящик сотрудника** (Gmail API / SMTP) |
| Виртуальные адреса = основной канал входа | Виртуальные адреса = опциональная фича для брендовых сценариев («support@») |
| Subject-line вводится в композере | Subject отлично восстанавливается из исходящего письма (мы его сохраняем) |

### Преимущества модели

🟢 **Клиент видит твой настоящий адрес** — это критично для юриста: доверие, бренд, история в его записной книжке.

🟢 **Почтовая история живёт в почте сотрудника** — отвалится ClientCase, переписка остаётся в Gmail/Yandex/корп-ящике.

🟢 **Provider-agnostic** — можно подключать любой ящик: Gmail (через OAuth), Yandex/Mail.ru/корп (через SMTP login).

🟢 **Никаких проблем с DKIM/SPF твоего домена** — мы не отправляем «как будто» от твоего имени, мы реально отправляем через твой SMTP.

🟢 **Roll-back простой** — выключил forward в Gmail, всё вернулось как было.

---

## 1. Архитектура — компоненты

### 1.1 Подключение ящика сотрудника

Каждый сотрудник в воркспейсе **может** подключить свой почтовый ящик (необязательно — без него письма просто не отправляются).

**Способы подключения:**

1. **Gmail OAuth** — уже есть в проекте (`gmail-auth`, `gmail-callback`). Расширяем UX, оставляем токены.
2. **SMTP login + IMAP login** — для Yandex/Mail.ru/корп-ящиков. Логин, пароль, SMTP/IMAP-сервер, порты.
3. **(Будущее) Microsoft 365 OAuth** — отложено на этап 2.

**Хранение:** существующая таблица `email_accounts` расширяется на новые поля.

### 1.2 Postmark — только приём

Postmark Server `clientcase-prod` принимает всю входящую почту на адрес `inbox@<slug>.clientcase.app`. Один общий webhook для всех воркспейсов.

**Функция Postmark в этой схеме:** «универсальный inbound MX-сервер». Не отправляет ничего.

**Альтернатива:** SES Inbound, Mailgun. Но Postmark проще на старте, потом можем переехать (raw MIME сохраняется).

### 1.3 Forward-правило в почте сотрудника

Сотрудник настраивает у себя в почтовой системе forward-правило:

- **Gmail:** Settings → Forwarding → Add forwarding address → `inbox@rs.clientcase.app`. Подтверждение по коду — мы автоматически перехватим письмо с кодом подтверждения и покажем код сотруднику в UI ClientCase.
- **Yandex:** аналогично через настройки.
- **Корп-почта:** инструкция на месте.

### 1.4 Маршрутизация входящего письма в тред

Письмо `client@example.com → ivan@petrov-firma.com → forward → inbox@rs.clientcase.app`

Postmark парсит и шлёт нам payload. Мы сохраняем raw MIME и пытаемся определить тред в порядке приоритета:

1. **По заголовку `In-Reply-To`** — если клиент отвечает на наше предыдущее письмо, его In-Reply-To указывает на Message-ID нашего отправленного. Мы храним Message-ID наших исходящих → находим тред.

2. **По `References`** — если In-Reply-To не сматчился (например, клиент пересылал куда-то), пробуем все ID из References.

3. **По From + project_participants** — ищем участника проекта (контакт-клиент) с этим email. Если найден один — кладём в дефолтный тред клиента в этом проекте. Если несколько — используем последний активный тред.

4. **По From + recent threads** — если есть открытый тред где этот From — последний автор, кладём туда.

5. **Не нашли** — `email_inbound_unmatched`, нотификация менеджеру воркспейса.

### 1.5 Адресация — сильно упрощённая

В Planfix-модели **внутренние адреса для клиентов не нужны**. Клиент пишет на обычную почту сотрудника. Внутренние адреса нужны только как:

- **Технический получатель forward-правила**: `inbox@<slug>.clientcase.app` (один на воркспейс).
- **Виртуальные адреса для брендовых сценариев**: `support@<slug>.clientcase.app` (опционально, если хочешь дать клиенту «нашу» почту вместо персональной сотрудника).

**Адреса `t+<short>` и `p+<short>` — отбрасываем.** Клиенты не пишут на них, тред определяется через In-Reply-To.

---

## 2. Изменения в БД

### 2.1 Миграция `20260506_email_planfix_setup.sql`

```sql
-- ============================================================
-- Planfix-style email: подключённые ящики + Postmark inbound
-- ============================================================

-- 1. Расширяем enum message_source
ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'email_internal';

-- 2. Расширяем существующую email_accounts — добавляем SMTP-режим (не только Gmail OAuth)
ALTER TABLE email_accounts
  -- Тип подключения
  ADD COLUMN IF NOT EXISTS auth_type text NOT NULL DEFAULT 'gmail_oauth'
    CHECK (auth_type IN ('gmail_oauth', 'smtp_password', 'microsoft_oauth')),
  -- Параметры SMTP/IMAP (зашифрованы через pg_sodium / Vault)
  ADD COLUMN IF NOT EXISTS smtp_host text,
  ADD COLUMN IF NOT EXISTS smtp_port int,
  ADD COLUMN IF NOT EXISTS smtp_username text,
  ADD COLUMN IF NOT EXISTS smtp_password_encrypted bytea,    -- через pgsodium
  ADD COLUMN IF NOT EXISTS smtp_use_tls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS imap_host text,
  ADD COLUMN IF NOT EXISTS imap_port int,
  -- Display name для From-заголовка
  ADD COLUMN IF NOT EXISTS display_name text,
  -- Forward-настройка (статус)
  ADD COLUMN IF NOT EXISTS forward_setup_status text NOT NULL DEFAULT 'not_setup'
    CHECK (forward_setup_status IN ('not_setup', 'pending_verification', 'verified', 'broken')),
  ADD COLUMN IF NOT EXISTS forward_target_address text,      -- inbox@rs.clientcase.app или с уникальным токеном
  ADD COLUMN IF NOT EXISTS forward_verified_at timestamptz,
  -- Последний успешный приём через forward (для health-check)
  ADD COLUMN IF NOT EXISTS last_inbound_at timestamptz,
  -- Подпись HTML (вставляется в исходящие, можно переопределить)
  ADD COLUMN IF NOT EXISTS signature_html text;

-- При smtp_password_encrypted — храним именно зашифрованный пароль.
-- Шифрование/расшифровка через RPC (вызывают только service-role и сам пользователь).

-- 3. Поле «к какому ящику отправляется» в треде (если у проекта/треда есть «дефолтный отправитель»)
ALTER TABLE project_threads
  ADD COLUMN IF NOT EXISTS email_send_account_id uuid REFERENCES email_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_subject_root text,
  ADD COLUMN IF NOT EXISTS email_last_external_address text;
-- email_send_account_id — определяется при создании треда (берётся ящик у автора треда),
-- может быть переопределён вручную.

-- 4. Поля у project_messages для email_internal (для исходящих и входящих)
ALTER TABLE project_messages
  ADD COLUMN IF NOT EXISTS email_message_id text,        -- RFC5322 Message-ID
  ADD COLUMN IF NOT EXISTS email_in_reply_to text,
  ADD COLUMN IF NOT EXISTS email_references text[],
  ADD COLUMN IF NOT EXISTS email_raw_mime_path text,
  ADD COLUMN IF NOT EXISTS email_postmark_id text,
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_send_account_id uuid REFERENCES email_accounts(id),
  ADD COLUMN IF NOT EXISTS email_delivery_status text
    CHECK (email_delivery_status IS NULL OR email_delivery_status IN
      ('queued', 'sent', 'delivered', 'bounced', 'failed'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_messages_email_message_id
  ON project_messages(email_message_id) WHERE email_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_messages_email_in_reply_to
  ON project_messages(email_in_reply_to) WHERE email_in_reply_to IS NOT NULL;

-- 5. Виртуальные адреса (опциональная фича — для «support@», «hh@» и т.п.)
-- ОСТАЁТСЯ как было в первой версии плана. Юзер может создавать виртуальные адреса
-- для случаев когда нужен брендовый адрес (на сайте, в визитке).
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
  CHECK (local_part NOT IN ('inbox', 'admin', 'noreply', 'postmaster', 'mailer-daemon'))
);

ALTER TABLE email_virtual_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_virtual_addresses_select ON email_virtual_addresses
  FOR SELECT USING (is_workspace_participant(workspace_id, auth.uid()));
CREATE POLICY email_virtual_addresses_modify ON email_virtual_addresses
  FOR ALL USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

-- 6. Нераспознанные письма
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
  -- Дополнительно: оригинальный получатель из X-Forwarded-For (если есть в forward-цепочке)
  original_to text,
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

-- 7. Workspace-level настройки
CREATE TABLE IF NOT EXISTS workspace_email_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  inbox_address text,                                    -- inbox@<slug>.clientcase.app, формируется из slug
  postmark_domain_id text,                               -- ID Sender Domain в Postmark API
  postmark_inbox_verified boolean NOT NULL DEFAULT false,
  reply_quote_style text NOT NULL DEFAULT 'gmail'
    CHECK (reply_quote_style IN ('gmail', 'outlook', 'minimal', 'none')),
  signature_html text,                                   -- общая подпись воркспейса (если у сотрудника нет своей)
  notify_managers_on_unmatched boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_email_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_email_settings_select ON workspace_email_settings
  FOR SELECT USING (is_workspace_participant(workspace_id, auth.uid()));
CREATE POLICY workspace_email_settings_modify ON workspace_email_settings
  FOR ALL USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));
```

### 2.2 RPC: матчинг входящего письма в тред

```sql
CREATE OR REPLACE FUNCTION public.match_inbound_email(
  p_workspace_id uuid,
  p_from_address text,
  p_in_reply_to text,
  p_references text[]
)
RETURNS TABLE (
  thread_id uuid,
  project_id uuid,
  match_method text                                      -- 'in_reply_to' | 'references' | 'from_participant' | 'from_recent_thread' | 'none'
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
    WHERE pm.workspace_id = p_workspace_id
      AND pm.email_message_id = p_in_reply_to
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'in_reply_to'::text;
      RETURN;
    END IF;
  END IF;

  -- 2. По References (массив, проверяем каждый)
  IF p_references IS NOT NULL AND array_length(p_references, 1) > 0 THEN
    SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
    FROM project_messages pm
    WHERE pm.workspace_id = p_workspace_id
      AND pm.email_message_id = ANY(p_references)
    ORDER BY pm.created_at DESC
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT v_thread_id, v_project_id, 'references'::text;
      RETURN;
    END IF;
  END IF;

  -- 3. По From — ищем недавний открытый тред где этот email фигурировал
  -- (например, контакт-клиент в каком-то проекте → его дефолтный тред).
  -- TODO: уточнить логику — например через project_participants с contact_email.
  SELECT pm.thread_id, pm.project_id INTO v_thread_id, v_project_id
  FROM project_messages pm
  WHERE pm.workspace_id = p_workspace_id
    AND pm.email_metadata->>'from_email' = p_from_address
    AND pm.created_at > now() - interval '90 days'
  ORDER BY pm.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_thread_id, v_project_id, 'from_recent_thread'::text;
    RETURN;
  END IF;

  -- 4. Не нашли
  RETURN QUERY SELECT NULL::uuid, NULL::uuid, 'none'::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_inbound_email(uuid, text, text, text[]) TO service_role;
```

### 2.3 RPC: резолв inbox-адреса → workspace

```sql
CREATE OR REPLACE FUNCTION public.resolve_inbox_workspace(p_address text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local text := lower(split_part(p_address, '@', 1));
  v_domain text := lower(split_part(p_address, '@', 2));
  v_slug text;
  v_workspace_id uuid;
BEGIN
  -- inbox@<slug>.clientcase.app
  IF v_local = 'inbox' AND v_domain LIKE '%.clientcase.app' THEN
    v_slug := substring(v_domain FROM 1 FOR length(v_domain) - length('clientcase.app') - 1);
    SELECT id INTO v_workspace_id FROM workspaces WHERE slug = v_slug AND is_deleted = false LIMIT 1;
    RETURN v_workspace_id;
  END IF;

  -- Виртуальный адрес support@, hh@, etc.
  -- Проверяем по email_virtual_addresses (даёт workspace_id)
  SELECT ev.workspace_id INTO v_workspace_id
  FROM email_virtual_addresses ev
  JOIN workspaces w ON w.id = ev.workspace_id
  WHERE ev.local_part = v_local
    AND ev.is_active = true
    AND v_domain LIKE w.slug || '.clientcase.app'
  LIMIT 1;

  RETURN v_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_inbox_workspace(text) TO service_role;
```

### 2.4 Триггер исходящих

```sql
CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
BEGIN
  -- Skip входящих/служебных источников
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event',
                    'telegram_business', 'telegram_mtproto', 'wazzup',
                    'email', 'email_internal') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN RETURN NEW; END IF;
  IF NEW.has_attachments = true THEN RETURN NEW; END IF;

  -- ВЕТКА: email_internal (если у треда есть привязанный email-ящик отправителя)
  IF NEW.thread_id IS NOT NULL THEN
    DECLARE
      v_send_account_id uuid;
      v_has_prior_email boolean;
    BEGIN
      SELECT email_send_account_id INTO v_send_account_id
      FROM project_threads WHERE id = NEW.thread_id;

      -- Тред email-канала — если у него привязан send_account ИЛИ был входящий email_internal
      v_has_prior_email := v_send_account_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM project_messages
        WHERE thread_id = NEW.thread_id
          AND source = 'email_internal'
          AND email_message_id IS NOT NULL
        LIMIT 1
      );

      IF v_has_prior_email THEN
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

  -- ... [остальные ветки telegram/wazzup/etc как раньше] ...

  RETURN NEW;
END;
$function$;
```

---

## 3. Edge Functions

### 3.1 `postmark-webhook` — приём forward'ов

**Где:** Next.js API route `src/app/api/postmark-webhook/route.ts` (нужен Node runtime для `mailparser`).

**Защита:** Basic Auth в URL.

**Поток:**

```typescript
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: NextRequest) {
  // 1. Auth check
  // 2. Parse Postmark JSON, decode RawEmail
  const parsed = await simpleParser(rawEmail)

  // 3. Дедуп по Message-ID
  // 4. Save raw MIME в Storage

  // 5. Резолв воркспейса по To-адресу (inbox@<slug>.clientcase.app)
  const toAddress = parsed.to?.value[0]?.address  // или ToFull[0].Email
  const workspaceId = await resolveInboxWorkspace(toAddress)

  // 6. Главный нюанс: оригинальный From — это форвард от сотрудника, а не от клиента.
  //    Реальный отправитель внутри пересланного MIME → нужно извлечь.
  const realFrom = extractOriginalFrom(parsed)
  // см. ниже helper extractOriginalFrom

  // 7. Match через RPC
  const match = await supabase.rpc('match_inbound_email', {
    p_workspace_id: workspaceId,
    p_from_address: realFrom.address,
    p_in_reply_to: parsed.inReplyTo,
    p_references: parsed.references,
  }).single()

  // 8. Если не нашли тред — записать в email_inbound_unmatched
  if (match.match_method === 'none') {
    await supabase.from('email_inbound_unmatched').insert({...})
    return ok()
  }

  // 9. INSERT project_messages
  await supabase.from('project_messages').insert({
    thread_id: match.thread_id,
    project_id: match.project_id,
    workspace_id: workspaceId,
    source: 'email_internal',
    content: parsed.html ?? parsed.text,
    sender_name: realFrom.name,
    sender_role: 'Email',
    email_message_id: parsed.messageId,
    email_in_reply_to: parsed.inReplyTo,
    email_references: parsed.references,
    email_subject: parsed.subject,
    email_raw_mime_path: rawPath,
    email_postmark_id: payload.MessageID,
    has_attachments: (parsed.attachments?.length ?? 0) > 0,
  })

  // 10. Загрузка вложений
  // 11. Обновить thread.email_last_external_address = realFrom.address
  return ok()
}

/**
 * extractOriginalFrom:
 *   Forward в Gmail оборачивает оригинальное письмо в новый MIME, но обычно
 *   оригинальное From сохраняется как часть body или в заголовке Reply-To.
 *
 *   Для Gmail-forward: From = ivan@petrov-firma.com (отправитель форварда),
 *                      Reply-To = client@example.com (если включена опция).
 *   Также Gmail добавляет в body: «---------- Forwarded message ---------»
 *   с заголовками From/To/Subject.
 *
 *   Стратегия:
 *   1. Если Reply-To !== From и Reply-To не наш inbox — берём Reply-To.
 *   2. Иначе — парсим тело forwarded-блока (regex по «From: <...>»).
 *   3. Иначе — fallback на From заголовка (ивановский ящик).
 */
```

**Этот helper — самая хитрая часть.** Разные почтовые системы заворачивают forward по-разному. Для каждого провайдера (Gmail, Yandex, Outlook) — свой parser. Стартуем с Gmail, остальное добавляется по мере необходимости.

### 3.2 `email-internal-send` — отправка через ящик сотрудника

**Где:** Supabase Edge Function `--no-verify-jwt`, защита `x-internal-secret`.

**Поток:**

```typescript
Deno.serve(async (req) => {
  if (!await requireInternalSecret(req)) return jsonRes({ error: 'Unauthorized' }, 401)

  const { message_id } = await req.json()
  const supabase = getServiceClient()

  // 1. Загрузить сообщение + send_account
  const { data: msg } = await supabase.from('project_messages').select(`
    id, thread_id, content, sender_name,
    email_send_account_id, email_subject, email_in_reply_to, email_references,
    project_threads (email_subject_root, email_last_external_address, email_send_account_id),
    message_attachments (file_name, mime_type, storage_path)
  `).eq('id', message_id).single()

  // 2. Определяем sendAccount — из сообщения или из треда
  const sendAccountId = msg.email_send_account_id ?? msg.project_threads.email_send_account_id
  if (!sendAccountId) return jsonRes({ skip: true })

  const { data: account } = await supabase.from('email_accounts')
    .select('*').eq('id', sendAccountId).single()

  // 3. Определяем получателя
  const toAddress = msg.project_threads.email_last_external_address
  if (!toAddress) return jsonRes({ error: 'No recipient' }, 400)

  // 4. Subject + Headers
  const subject = msg.project_threads.email_subject_root
    ? `Re: ${msg.project_threads.email_subject_root}`
    : msg.email_subject

  const messageIdHeader = `<${crypto.randomUUID()}@${account.email.split('@')[1]}>`

  // 5. Конвертация HTML
  const safeHtml = sanitizeAndInlineStyles(msg.content)

  // 6. Отправка по типу подключения
  let postmarkId: string | undefined
  if (account.auth_type === 'gmail_oauth') {
    // Используем существующую логику gmail-send (refactor: вынести в _shared)
    const result = await sendViaGmail({
      account,
      to: toAddress,
      subject,
      html: safeHtml,
      attachments: msg.message_attachments,
      inReplyTo: msg.email_in_reply_to,
      references: msg.email_references,
      messageIdHeader,
    })
    postmarkId = result.gmail_message_id
  } else if (account.auth_type === 'smtp_password') {
    await sendViaSmtp({
      account,
      to: toAddress,
      subject,
      html: safeHtml,
      attachments: msg.message_attachments,
      inReplyTo: msg.email_in_reply_to,
      references: msg.email_references,
      messageIdHeader,
    })
  }

  // 7. Сохранить идентификаторы и статус
  await supabase.from('project_messages').update({
    email_message_id: messageIdHeader,
    email_send_account_id: sendAccountId,
    email_delivery_status: 'sent',
  }).eq('id', message_id)

  return jsonRes({ ok: true })
})
```

**Helpers `sendViaGmail` и `sendViaSmtp`:**
- `sendViaGmail` — переиспользуем существующий `gmail-send`. Делаем shared module.
- `sendViaSmtp` — новый. Используем `npm:nodemailer` (Deno поддерживает через `npm:` префикс).

### 3.3 Функция активации воркспейса

Расширяем `provision-domain`:

```typescript
// type='email' — настройка приёма для воркспейса
if (body.type === 'email') {
  // 1. Postmark API: добавить Sender Domain <slug>.clientcase.app (для inbound)
  // 2. Cloudflare API: добавить MX <slug>.clientcase.app → inbound.postmarkapp.com
  // 3. Сохранить в workspace_email_settings: inbox_address = inbox@<slug>.clientcase.app
  // 4. INSERT system project «Email inbox» если notify_managers_on_unmatched
}
```

### 3.4 Функция настройки forward (для каждого аккаунта)

Новый endpoint `connect-email-account`:
1. **Gmail OAuth**: запускает OAuth-flow, получает токены.
2. **SMTP**: принимает host/port/username/password, тестирует подключение.
3. **Auto-setup forward** (для Gmail OAuth — мы можем сами добавить forward через API):
   - `POST gmail.googleapis.com/gmail/v1/users/me/settings/forwardingAddresses` с `forwardingEmail = inbox@<slug>.clientcase.app`.
   - Дождаться письма с кодом (Postmark примет, мы выловим).
   - `POST .../verify` с кодом.
   - `PUT .../settings/forwarding` `{enabled: true, emailAddress: ...}`.
4. **Вручную** (для SMTP — мы не управляем чужой почтой):
   - Показать инструкцию: «Зайдите в настройки Yandex Mail → Правила → Создать правило → Пересылать на inbox@rs.clientcase.app».

---

## 4. Расширение клиентского кода

### 4.1 messengerService — отправка email

В существующем `messengerService.ts` добавить ветку:

```typescript
// Если у треда thread.email_send_account_id заполнен И у нас есть вложения —
// инициируем отправку через email-internal-send (как для wazzup и telegram-attachments).
if (hasAnyAttachments && params.threadId) {
  const { data: thread } = await supabase
    .from('project_threads')
    .select('email_send_account_id')
    .eq('id', params.threadId).maybeSingle()

  if (thread?.email_send_account_id) {
    await supabase.auth.getSession()
    supabase.functions.invoke('email-internal-send', {
      body: { message_id: message.id, attachments_only: true },
    }).catch((err) => logger.error('Email send failed:', err))
  }
}
```

### 4.2 UI: «Подключить почту» — в профиле сотрудника

`/profile/email` или `/workspaces/[id]/settings/integrations` (для voркспейса):

```
[ ] Gmail (через OAuth)         → кнопка «Подключить»
[ ] Яндекс / Mail.ru / корп     → кнопка «Подключить SMTP»
                                   → диалог: email, server, port, password
[ ] Microsoft 365               → (отложено)

Подключённые ящики:
  - ivan@petrov-firma.com (Gmail OAuth)         [✓ Forward активен]   [Удалить]
  - sales@petrov-firma.com (SMTP yandex.ru)     [⚠ Настройте forward] [Инструкция]
```

**Под каждым ящиком — раздел «Forward»:**
- Если Gmail OAuth → автоматически настраивается, показывается статус.
- Если SMTP → показывается инструкция: «В настройках Яндекс-почты создайте правило: пересылать всё → `inbox@rs.clientcase.app`. Затем нажмите Проверить ниже».

### 4.3 UI: вкладка «Email» в IntegrationsTab воркспейса

Owner видит:
- **Inbox-адрес воркспейса**: `inbox@rs.clientcase.app` (с кнопкой копирования).
- **Список подключённых ящиков сотрудников** — read-only обзор.
- **Виртуальные адреса** (если используются) — CRUD как в первой версии плана.
- **Нераспознанные письма** — ссылка на отдельную страницу.
- **Активация Postmark** — кнопка «Активировать email» (если ещё не активировано).

### 4.4 UI: композер для email-тредов

Если тред привязан к email (`email_send_account_id IS NOT NULL` или есть `email_internal` сообщения):
- Сверху подсказка: «Отправляется как email с **ivan@petrov-firma.com** клиенту **client@example.com**».
- Поле «Тема» (Subject) — для **первого** письма треда. После — авто-`Re:`.
- Полноценный rich-text композер.

### 4.5 UI: индикатор канала в шапке треда

Аналогично Telegram-ссылке — иконка email + email-адрес контакта-клиента.

---

## 5. Безопасность

1. **SMTP-пароли в БД** — шифровать через pg_sodium. Расшифровка только в Edge Function (через RPC с проверкой прав).
2. **Postmark webhook** — Basic Auth.
3. **HTML-санитизация** — DOMPurify на входящие (рендер) и исходящие (отправка).
4. **Rate limiting на отправку** — не более 200 писем/мин на воркспейс.
5. **RLS** — `email_accounts` доступен только владельцу аккаунта + менеджерам воркспейса. SMTP-пароли никогда не возвращаются клиенту.
6. **Валидация forward-адреса** — проверка что forward действительно работает (через тест-письмо при активации).

---

## 6. Phase breakdown

### Phase 0 — Postmark setup (1 час)

- [ ] Регистрация на postmarkapp.com.
- [ ] Создать Server `clientcase-prod` (только inbound).
- [ ] Получить Account API Token + Server Token + Webhook Auth → в Supabase secrets.
- [ ] План — Free → Pro по мере роста.

### Phase 1 — БД (0.5 дня)

- [ ] Применить миграцию `20260506_email_planfix_setup.sql`.
- [ ] Применить RPC `match_inbound_email`, `resolve_inbox_workspace`.
- [ ] Расширить триггер `notify_telegram_on_new_message`.

### Phase 2 — Provision-сервис: email-setup (1 день)

- [ ] Расширить `/opt/clientcase-provision/provision.sh` командой `email-setup <slug>`.
- [ ] Расширить Edge Function `provision-domain` типом `email`.
- [ ] Добавить `POSTMARK_ACCOUNT_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` в secrets.
- [ ] Тест на тестовом домене.

### Phase 3 — Postmark inbound webhook (1-2 дня)

- [ ] `src/app/api/postmark-webhook/route.ts` — приём, парсинг, маршрутизация.
- [ ] Helper `extractOriginalFrom` — извлечение реального отправителя из forward-MIME (Gmail-вариант).
- [ ] Тест: настроить forward в личном Gmail на тестовый inbox, отправить письмо себе → проверить тред.

### Phase 4 — Подключение ящика сотрудника (2 дня)

- [ ] Расширить таблицу `email_accounts` (миграция в Phase 1).
- [ ] Edge Function `connect-email-account` (OAuth + SMTP setup).
- [ ] Refactor `gmail-send` → переиспользуемая функция `sendViaGmail` в `_shared/`.
- [ ] Реализовать `sendViaSmtp` через `nodemailer`.
- [ ] UI: страница «Мои подключённые ящики» в профиле.

### Phase 5 — Auto-setup forward для Gmail (1 день)

- [ ] При подключении Gmail-аккаунта автоматически добавить forward на `inbox@<slug>.clientcase.app`.
- [ ] Перехватить confirmation-письмо в нашем Postmark webhook → распарсить код → подтвердить через Gmail API.
- [ ] Status: pending_verification → verified.

### Phase 6 — Edge Function: email-internal-send (1 день)

- [ ] `supabase/functions/email-internal-send/index.ts`.
- [ ] Поддержка обоих auth-типов (Gmail OAuth, SMTP).
- [ ] Reply-threading через In-Reply-To/References.
- [ ] Frontend invoke в messengerService для attachments.

### Phase 7 — UI треда и настроек (2-3 дня)

- [ ] Композер с полем Subject для email-тредов.
- [ ] Индикатор email-канала в шапке.
- [ ] Раздел «Нераспознанные письма».
- [ ] Виртуальные адреса (опциональная фича).
- [ ] Активация email на воркспейсе (вкладка «Домен» расширяется).

### Phase 8 — SMTP-инструкции (0.5 дня)

- [ ] Готовые инструкции по настройке forward для популярных провайдеров (Yandex, Mail.ru, корп).

**Итого: ~10-12 рабочих дней.**

---

## 7. Открытые вопросы

1. **Forward-адрес: один на воркспейс или один на сотрудника?**
   - Один (`inbox@rs.clientcase.app`) — проще, но если forward сломается — все сотрудники без писем.
   - Per-employee (`inbox+ivan@rs.clientcase.app`) — изоляция, плюс мы знаем кто форвардит.
   - **Рекомендую: один на воркспейс**, в `extractOriginalFrom` определяем сотрудника по From-заголовку (а не по To).

2. **Для SMTP-провайдеров без OAuth — как хранить пароль?**
   - Шифровать через pg_sodium с `app.settings.encryption_key`.
   - **Вариант лучше:** App-passwords (Yandex, Yahoo, Apple) — это отдельные пароли только для IMAP/SMTP, можно отозвать. Подсказывать пользователю в UI.

3. **Нужен ли IMAP в дополнение к SMTP?**
   - SMTP — только отправка.
   - IMAP — нужен для синхронизации «Отправленных» (письмо из ClientCase должно появиться в папке Sent у сотрудника).
   - Gmail SMTP при отправке через `smtp.gmail.com` НЕ кладёт письмо в Sent. Нужен IMAP-add для этого.
   - **Рекомендую:** да, добавить IMAP-параметры для SMTP-аккаунтов.

4. **Что с групповыми клиентами (Cc/Bcc)?**
   - Если письмо с Cc — сохраняем все адреса. Отвечать только в To или всем?
   - **Рекомендую:** при ответе показывать чекбокс «Ответить всем» (Reply All).

5. **Дубли при forward**
   - Если сотрудник в копии (Cc), письмо может прилететь и через основной forward, и через персональный.
   - Дедуп через `email_message_id` (уникальный индекс).

6. **Bounce-нотификации**
   - Если SMTP-отправка не доставилась, Gmail/Yandex шлёт «Mail Delivery Failed» обратно сотруднику.
   - Это письмо тоже forward'ится → попадает к нам → можно распарсить и пометить наше отправленное как `bounced`.
   - Edge case, не критично на старте.

---

## 8. Метрики успеха

- ✅ 95%+ ответов клиентов автоматически попадают в правильный тред (через In-Reply-To).
- ✅ Доставляемость исходящих равна доставляемости через Gmail/SMTP сотрудника (без нашего влияния).
- ✅ Подключение нового ящика ≤ 5 мин (включая forward-настройку).
- ✅ Latency приёма входящего ≤ 30 секунд (forward + Postmark + наш webhook).

---

## 9. Что НЕ делаем в этой итерации

- ❌ Custom-домены клиентов для email.
- ❌ Маркетинговые рассылки.
- ❌ PGP/S/MIME.
- ❌ Поиск по архиву писем.
- ❌ Sync контактов в CRM-карточки.
- ❌ Microsoft 365 OAuth.
- ❌ Шаблоны исходящих писем.

---

## 10. Готовность

Документ покрывает:
- ✅ Planfix-style модель целиком (отправка через ящик сотрудника, приём через forward)
- ✅ Полные SQL-миграции с расширением existing `email_accounts`
- ✅ RPC матчинга через In-Reply-To/References/From
- ✅ Псевдокод webhook (Next.js API route с mailparser) и send (Deno Edge Function с nodemailer)
- ✅ Phase breakdown с конкретными задачами
- ✅ Безопасность (шифрование SMTP-паролей, Basic Auth webhook'ов)

**Готов начать с Phase 0 после твоего OK.**
