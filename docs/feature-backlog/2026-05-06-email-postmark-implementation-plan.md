# Email через Postmark Inbound — детальный план реализации

**Дата:** 2026-05-06
**Связано с:** [`2026-05-04-email-postmark-internal-addresses.md`](./2026-05-04-email-postmark-internal-addresses.md) (исходное ТЗ — общая концепция).
**Статус:** план реализации, готов к старту по фазам.

Этот документ — **детализация исходного ТЗ** с учётом инфраструктуры, которую мы построили после написания ТЗ (subdomain routing, slug, custom_domain, provisioning service, short_id). Где детали в исходном ТЗ устарели — здесь приоритет.

---

## 0. Что изменилось по сравнению с исходным ТЗ

| Что было в ТЗ от 2026-05-04 | Что обновляем |
|----------------------------|---------------|
| Адресная схема `t+<random12>@<slug>.clientcase.app` (генерируем токен 12 символов base32) | Используем существующий `short_id` для тредов и проектов: `t+<short>@<slug>.clientcase.app`. Уже работает, не нужна отдельная таблица токенов. |
| Отдельная таблица `email_thread_addresses` для хранения токенов | **Не нужна.** `project_threads.short_id` + `projects.short_id` уже есть. Адреса резолвятся через RPC `resolve_short_id`. |
| Postmark Free → Pro → Platform | Сразу **Pro** ($16.50/мес, 10 доменов) на старте — на 1 воркспейс хватит. **Platform** ($18/мес, unlimited) при появлении 5+ воркспейсов. |
| Custom-домены клиентов как отдельная фича | **Откладываем на этап 2** — сначала только email на `<slug>.clientcase.app`. Custom-домены для email — отдельная история, у нас уже есть для веба. |
| Edge Function `email-provision-workspace-domain` отдельный | **Расширяем существующий** `provision-domain` Edge Function + bash-скрипт `/opt/clientcase-provision/provision.sh`. Теперь умеет ещё и email-операции (Postmark API + DNS MX). |
| Gmail оставляем как «отправка от своего ящика» | **Всё так же** — в этом плане Gmail не трогаем. Параллельная работа. |

---

## 1. Финальная архитектура

### 1.1 Поток входящего письма

```
Клиент пишет email на t+15@kvp.clientcase.app
         ↓
DNS MX kvp.clientcase.app → inbound.postmarkapp.com (через миграцию)
         ↓
Postmark принимает MIME, парсит, шлёт JSON-payload
         ↓
POST https://my.clientcase.app/_internal/postmark-webhook (один endpoint для всех воркспейсов)
         ↓
nginx → docker container clientcase-app-test
         ↓
proxy.ts видит путь /_internal/* → пропускает (не рерайтит)
         ↓
NEXT route /api/postmark-webhook (новый Route Handler)
         ↓
Логика:
  1. Проверка Basic Auth header
  2. Парсинг RawEmail (base64 → MIME → mailparser)
  3. Загрузка raw MIME в Storage (для аудита/реплея)
  4. Извлечение To-адреса → slug + local-part
  5. Resolve workspace_id по slug (RPC resolve_workspace_by_host эквивалент, но по slug)
  6. Резолв треда:
     - t+<short> → project_threads.short_id в этом workspace
     - p+<short> → projects.short_id → создать новый тред в проекте
     - support@ / любой кастом → email_virtual_addresses → правило → тред
     - Не нашли → fallback по In-Reply-To/References → tred с этим Message-ID
     - Совсем не нашли → email_inbound_unmatched + нотификация менеджеру
  7. INSERT project_messages с source='email_internal'
  8. Загрузка вложений в Storage + INSERT message_attachments
  9. Realtime-уведомление о новом сообщении (стандартный механизм, ничего нового)
  10. 200 OK Postmark'у
```

### 1.2 Поток исходящего письма

```
Юзер пишет ответ в треде (UI композер)
         ↓
INSERT project_messages с source='email_internal' через messengerService
         ↓
Trigger notify_telegram_on_new_message (переименовать в notify_outbound_message
или оставить имя, расширить логикой)
         ↓
Если thread.email_address_active=true И source='email_internal' → POST
https://...functions/v1/email-internal-send с x-internal-secret
         ↓
Edge Function email-internal-send:
  1. Загрузить project_messages + project_threads + workspace
  2. Найти контакт-получателя (последний From в треде)
  3. Конвертация tiptap-HTML → email-safe HTML (с inline стилями)
  4. From: "Имя Сотрудника" <t+15@kvp.clientcase.app>
  5. Reply-To: t+15@kvp.clientcase.app
  6. In-Reply-To / References: цепочка из предыдущих email_message_id треда
  7. Subject: тема первого письма треда (хранится в email_subject_root)
  8. Вложения: signed URLs из Storage → base64 в Postmark Attachments[]
  9. POST https://api.postmarkapp.com/email с X-Postmark-Server-Token
  10. Сохранить email_message_id, email_postmark_id
  11. Обновить delivery_status='sent'
         ↓
Postmark отправляет MIME → SMTP → клиент получает
         ↓
Bounce/Complaint → POST email-bounce-webhook → обновляет delivery_status
```

### 1.3 Структура доменов

После всех изменений у воркспейса с `slug='kvp'` будет так:

```
kvp.clientcase.app:
  HTTP (443/80) → nginx → app (workspace UI)
  MX → inbound.postmarkapp.com
  DKIM/SPF/Return-Path TXT → Postmark
  
my.clientcase.app:
  HTTP /_internal/postmark-webhook → провижининг сервис? нет, прямо в app
  HTTP /_internal/provision → провижининг сервис (как сейчас)
```

**Email-адреса:**
- `t+<short>@kvp.clientcase.app` — автоматический адрес треда (используем `project_threads.short_id`)
- `p+<short>@kvp.clientcase.app` — адрес проекта
- `support@kvp.clientcase.app`, `hh@kvp.clientcase.app` — виртуальные адреса (создаются юзером)

### 1.4 Постмарк-сторона: как организовано

**Один Postmark Server `clientcase-prod`** (в дашборде Postmark — это аналог «проекта»):
- Один **Inbound Webhook URL** на ALL inbound: `https://my.clientcase.app/_internal/postmark-webhook` (Basic Auth)
- Каждый воркспейс-поддомен (`kvp.clientcase.app`, `petrov.clientcase.app`) добавляется как **Sender Domain** через Postmark API
- Inbound идёт по DNS — Postmark принимает на `inbound.postmarkapp.com` от всех зарегистрированных доменов

**API ключ** Postmark Server хранится в Supabase secrets как `POSTMARK_SERVER_TOKEN`.

**Лимиты:**
- Pro план: 10 Sender Domains. Хватит на 10 воркспейсов.
- Platform: unlimited.
- Сообщений: 10 000 в месяц на Pro/Platform (in + out общий счётчик).

---

## 2. Изменения в БД — полные SQL-миграции

### 2.1 Миграция `20260506_email_postmark_internal_setup.sql`

```sql
-- ============================================================
-- Email через Postmark Inbound: подготовка БД
-- ============================================================

-- 1. Расширяем enum message_source
ALTER TYPE message_source ADD VALUE IF NOT EXISTS 'email_internal';

-- 2. Поля для email на уровне воркспейса
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS email_postmark_domain_id text,        -- ID Sender Domain в Postmark API
  ADD COLUMN IF NOT EXISTS email_dkim_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_return_path_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_mx_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_active boolean NOT NULL DEFAULT false,  -- общий флаг готовности
  ADD COLUMN IF NOT EXISTS email_activated_at timestamptz;

-- 3. Расширяем project_messages (поля для email_internal)
ALTER TABLE project_messages
  ADD COLUMN IF NOT EXISTS email_message_id text,                -- RFC5322 Message-ID (для чейнинга)
  ADD COLUMN IF NOT EXISTS email_in_reply_to text,
  ADD COLUMN IF NOT EXISTS email_references text[],
  ADD COLUMN IF NOT EXISTS email_raw_mime_path text,             -- Storage path для raw MIME
  ADD COLUMN IF NOT EXISTS email_postmark_id text,               -- ID письма в Postmark (для отладки)
  ADD COLUMN IF NOT EXISTS email_subject text,
  ADD COLUMN IF NOT EXISTS email_delivery_status text
    CHECK (email_delivery_status IS NULL OR email_delivery_status IN
      ('sending', 'sent', 'delivered', 'bounced', 'complaint', 'opened', 'clicked', 'failed'));

-- Уникальность Message-ID для дедупа (повторный POST от Postmark не создаст дубль)
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_messages_email_message_id
  ON project_messages(email_message_id) WHERE email_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_messages_email_in_reply_to
  ON project_messages(email_in_reply_to) WHERE email_in_reply_to IS NOT NULL;

-- 4. Расширяем project_threads (поля для email_internal)
ALTER TABLE project_threads
  ADD COLUMN IF NOT EXISTS email_address_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_subject_root text,              -- Тема первого письма треда (для Subject: всех ответов)
  ADD COLUMN IF NOT EXISTS email_last_external_address text;     -- Последний From — туда отвечаем по умолчанию

-- 5. Виртуальные адреса с правилами (как у Planfix: support@, hh@, leads@...)
CREATE TABLE IF NOT EXISTS email_virtual_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  local_part text NOT NULL,                                       -- 'support', 'hh', 'leads'
  display_name text,                                              -- 'Поддержка клиентов'
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
  spam_threshold int DEFAULT 5,                                   -- если Spam-Score выше → корзина

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),

  UNIQUE (workspace_id, local_part),
  CHECK (local_part ~ '^[a-z0-9]([a-z0-9._-]{0,28}[a-z0-9])?$'),  -- только латиница/цифры/-_.
  CHECK (local_part NOT IN ('t', 'p', 'u', 'admin', 'noreply', 'postmaster', 'mailer-daemon'))
);

ALTER TABLE email_virtual_addresses ENABLE ROW LEVEL SECURITY;

-- SELECT — любому участнику воркспейса (видеть какие адреса настроены)
CREATE POLICY email_virtual_addresses_select ON email_virtual_addresses
  FOR SELECT
  USING (is_workspace_participant(workspace_id, auth.uid()));

-- INSERT/UPDATE/DELETE — только менеджерам
CREATE POLICY email_virtual_addresses_modify ON email_virtual_addresses
  FOR ALL
  USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'))
  WITH CHECK (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

-- 6. Письма, не привязанные ни к какому треду (нужен ручной разбор)
CREATE TABLE IF NOT EXISTS email_inbound_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  raw_mime_path text NOT NULL,                                    -- путь в Storage
  postmark_id text,                                               -- для отладки
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] NOT NULL,
  cc_addresses text[],
  subject text,
  message_id_header text,                                         -- RFC5322 Message-ID входящего
  in_reply_to text,
  references_headers text[],
  received_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,                                           -- 'unknown_workspace', 'no_token_match', 'invalid_local_part'
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_thread_id uuid REFERENCES project_threads(id) ON DELETE SET NULL,
  spam_score numeric
);

ALTER TABLE email_inbound_unmatched ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_inbound_unmatched_select ON email_inbound_unmatched
  FOR SELECT
  USING (workspace_id IS NULL OR has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

CREATE POLICY email_inbound_unmatched_update ON email_inbound_unmatched
  FOR UPDATE
  USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));

CREATE INDEX idx_email_inbound_unmatched_workspace_unresolved
  ON email_inbound_unmatched(workspace_id, received_at DESC) WHERE resolved_at IS NULL;

-- 7. Системный inbox-проект для нераспознанных писем (один на воркспейс, опциональный)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_system_email_inbox boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_system_email_inbox_per_ws
  ON projects(workspace_id) WHERE is_system_email_inbox;

-- 8. Workspace-level настройки email
CREATE TABLE IF NOT EXISTS workspace_email_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  default_from_name text,                                         -- "ClientCase" по умолчанию
  signature_html text,
  reply_quote_style text NOT NULL DEFAULT 'gmail'
    CHECK (reply_quote_style IN ('gmail', 'outlook', 'minimal', 'none')),
  spam_filter_strict boolean NOT NULL DEFAULT false,
  notify_managers_on_unmatched boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workspace_email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_email_settings_select ON workspace_email_settings
  FOR SELECT
  USING (is_workspace_participant(workspace_id, auth.uid()));

CREATE POLICY workspace_email_settings_modify ON workspace_email_settings
  FOR ALL
  USING (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'))
  WITH CHECK (has_workspace_permission(workspace_id, auth.uid(), 'manage_workspace_settings'));
```

### 2.2 RPC для входящих писем

```sql
-- ============================================================
-- RPC: парсинг To-адреса → workspace + entity (тред/проект/виртуал)
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_inbound_email_address(p_address text)
RETURNS TABLE (
  workspace_id uuid,
  workspace_slug text,
  resolution_type text,                                           -- 'thread' | 'project' | 'virtual' | 'unknown_local' | 'unknown_workspace'
  thread_id uuid,
  project_id uuid,
  virtual_address_id uuid,
  routing_mode text,
  target_project_id uuid,
  target_thread_id uuid,
  default_thread_template_id uuid,
  default_assignee_user_id uuid,
  auto_reply_enabled boolean,
  auto_reply_text text,
  spam_threshold int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_local_part text;
  v_domain text;
  v_slug text;
  v_root_domain text := 'clientcase.app';
  v_workspace_id uuid;
  v_short_id int;
BEGIN
  -- Парсим адрес: "support@kvp.clientcase.app" → local='support', domain='kvp.clientcase.app'
  v_local_part := lower(split_part(p_address, '@', 1));
  v_domain := lower(split_part(p_address, '@', 2));

  -- Резолв slug
  IF v_domain LIKE '%.' || v_root_domain THEN
    v_slug := substring(v_domain FROM 1 FOR length(v_domain) - length(v_root_domain) - 1);
  ELSE
    -- custom_domain — резолвим по полю
    SELECT w.id, w.slug INTO v_workspace_id, v_slug
    FROM workspaces w WHERE w.custom_domain = v_domain AND w.is_deleted = false LIMIT 1;
  END IF;

  IF v_slug IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, 'unknown_workspace'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::int;
    RETURN;
  END IF;

  -- Резолв workspace_id если ещё не нашли через custom_domain
  IF v_workspace_id IS NULL THEN
    SELECT w.id INTO v_workspace_id
    FROM workspaces w WHERE w.slug = v_slug AND w.is_deleted = false LIMIT 1;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, v_slug, 'unknown_workspace'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::int;
    RETURN;
  END IF;

  -- Тип адреса по local_part
  -- 1) t+<short_id> → конкретный тред
  IF v_local_part ~ '^t\+[0-9]+$' THEN
    v_short_id := substring(v_local_part FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'thread'::text,
        pt.id, pt.project_id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::int
      FROM project_threads pt
      WHERE pt.workspace_id = v_workspace_id AND pt.short_id = v_short_id;
    RETURN;
  END IF;

  -- 2) p+<short_id> → проект (создать новый тред)
  IF v_local_part ~ '^p\+[0-9]+$' THEN
    v_short_id := substring(v_local_part FROM 3)::int;
    RETURN QUERY
      SELECT v_workspace_id, v_slug, 'project'::text,
        NULL::uuid, p.id, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
        NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::int
      FROM projects p
      WHERE p.workspace_id = v_workspace_id AND p.short_id = v_short_id AND p.is_deleted = false;
    RETURN;
  END IF;

  -- 3) Виртуальный адрес (support@, hh@, leads@...)
  RETURN QUERY
    SELECT v_workspace_id, v_slug, 'virtual'::text,
      NULL::uuid, NULL::uuid, ev.id, ev.routing_mode,
      ev.target_project_id, ev.target_thread_id,
      ev.default_thread_template_id, ev.default_assignee_user_id,
      ev.auto_reply_enabled, ev.auto_reply_text, ev.spam_threshold
    FROM email_virtual_addresses ev
    WHERE ev.workspace_id = v_workspace_id
      AND ev.local_part = v_local_part
      AND ev.is_active = true;

  IF NOT FOUND THEN
    RETURN QUERY SELECT v_workspace_id, v_slug, 'unknown_local'::text,
      NULL::uuid, NULL::uuid, NULL::uuid, NULL::text, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::boolean, NULL::text, NULL::int;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_inbound_email_address(text) TO service_role;
-- Сюда anon/authenticated не пускаем — это внутренняя функция для inbound webhook'а
```

### 2.3 RPC для генерации адреса треда

Уже есть `resolve_short_id` (наоборот — short_id → uuid). Для UI нужен helper-RPC, формирующий полный адрес:

```sql
CREATE OR REPLACE FUNCTION public.get_thread_email_address(p_thread_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_short_id int;
  v_workspace_slug text;
  v_workspace_email_active boolean;
BEGIN
  SELECT pt.short_id, w.slug, w.email_active
  INTO v_short_id, v_workspace_slug, v_workspace_email_active
  FROM project_threads pt
  JOIN workspaces w ON w.id = pt.workspace_id
  WHERE pt.id = p_thread_id;

  IF v_short_id IS NULL OR v_workspace_slug IS NULL OR NOT v_workspace_email_active THEN
    RETURN NULL;
  END IF;

  RETURN 't+' || v_short_id || '@' || v_workspace_slug || '.clientcase.app';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_thread_email_address(uuid) TO authenticated;
```

### 2.4 Обновление триггера на исходящие

```sql
-- ============================================================
-- Расширение notify_telegram_on_new_message → email_internal ветка
-- ============================================================

CREATE OR REPLACE FUNCTION public.notify_telegram_on_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tg_chat project_telegram_chats%ROWTYPE;
  v_business_connection_id UUID;
  v_mtproto_session_user_id UUID;
  v_mtproto_client_tg_user_id BIGINT;
  v_email_active BOOLEAN;
BEGIN
  -- Skip входящих/служебных источников (избегаем циклов)
  IF NEW.source IN ('telegram', 'telegram_service', 'bot_event',
                    'telegram_business', 'telegram_mtproto', 'wazzup',
                    'email', 'email_internal') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_draft = true THEN RETURN NEW; END IF;
  IF NEW.has_attachments = true THEN RETURN NEW; END IF;  -- фронт сам отправит

  -- ВЕТКА 0: email_internal (треды связанные с email-каналом)
  -- Проверяем что у воркспейса включён email И тред помечен как email-канал
  IF NEW.thread_id IS NOT NULL THEN
    SELECT pt.email_address_active AND w.email_active
    INTO v_email_active
    FROM project_threads pt
    JOIN workspaces w ON w.id = pt.workspace_id
    WHERE pt.id = NEW.thread_id;

    -- Тред помечен email-каналом: смотрим был ли в нём входящий email_internal
    -- Если да → отвечаем по email
    IF v_email_active AND EXISTS (
      SELECT 1 FROM project_messages
      WHERE thread_id = NEW.thread_id
        AND source = 'email_internal'
        AND email_message_id IS NOT NULL
      LIMIT 1
    ) THEN
      PERFORM net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/email-internal-send',
        body := jsonb_build_object('message_id', NEW.id),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', current_setting('app.settings.internal_function_secret', true)
        )
      );
      RETURN NEW;
    END IF;
  END IF;

  -- ВЕТКА 1: MTProto (как было)
  -- ... [существующая логика]

  -- ВЕТКА 2: Telegram Business (как было)
  -- ... [существующая логика]

  -- ВЕТКА 3: Групповой бот (как было)
  -- ... [существующая логика]

  RETURN NEW;
END;
$function$;
```

**Важно:** `INTERNAL_FUNCTION_SECRET` должен быть в БД-настройках или хардкоден в триггере (как сейчас для других веток — там значение прямо в SQL). На производстве хранится в Supabase secrets и подставляется при создании миграции.

---

## 3. Edge Functions

### 3.1 `postmark-webhook` (входящие письма)

**Деплой:** проксируется через nginx `/_internal/postmark-webhook` → app, **не** Supabase Edge Function.
Причина: используем тот же container что обрабатывает остальной HTTP-трафик. Это позволяет переиспользовать parser MIME (Node-side через `mailparser` npm), не пилить deno-эквивалент.

**Альтернатива:** Edge Function на Deno + `npm:mailparser`. Работает, но менее удобно для отладки.

**Решение:** делаем как Next.js API route — `src/app/api/postmark-webhook/route.ts`.

**Защита:** Postmark поддерживает Basic Auth в webhook URL. Передаём credentials в URL: `https://user:pass@my.clientcase.app/_internal/postmark-webhook`. На стороне Next.js проверяем заголовок `Authorization: Basic ...`.

**Псевдокод:**

```typescript
// src/app/api/postmark-webhook/route.ts
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'  // нужен Node для mailparser
export const maxDuration = 60    // парсинг + загрузка вложений могут занять время

import { NextRequest, NextResponse } from 'next/server'
import { simpleParser } from 'mailparser'
import { createClient } from '@supabase/supabase-js'

const POSTMARK_WEBHOOK_AUTH = process.env.POSTMARK_WEBHOOK_AUTH ?? ''
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // service role, не anon
)

export async function POST(req: NextRequest) {
  // 1. Auth
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Basic ${Buffer.from(POSTMARK_WEBHOOK_AUTH).toString('base64')}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // 2. Парсим Postmark JSON payload
  const payload = await req.json()
  const rawEmail = Buffer.from(payload.RawEmail ?? '', 'base64')
  const parsed = await simpleParser(rawEmail)
  const messageIdHeader = parsed.messageId  // <abc@gmail.com>

  // 3. Дедуп по Message-ID
  const { data: existing } = await supabase
    .from('project_messages')
    .select('id')
    .eq('email_message_id', messageIdHeader)
    .maybeSingle()
  if (existing) return new NextResponse('OK (dedup)', { status: 200 })

  // 4. Сохраняем raw MIME в Storage
  const today = new Date()
  const rawPath = `inbox/${today.getFullYear()}/${today.getMonth()+1}/${crypto.randomUUID()}.eml`
  await supabase.storage.from('email-raw-mime').upload(rawPath, rawEmail, {
    contentType: 'message/rfc822',
  })

  // 5. Резолв адреса получателя через RPC
  // Postmark может прислать несколько To-адресов — берём первый который наш
  const toAddresses = (payload.ToFull ?? [{ Email: payload.To }]).map((t: any) => t.Email)
  const ourAddresses = toAddresses.filter((a: string) =>
    a.includes('.clientcase.app') || /* TODO: custom_domain check */ false
  )
  if (ourAddresses.length === 0) {
    return new NextResponse('OK (not our domain)', { status: 200 })
  }

  const { data: resolution } = await supabase.rpc('resolve_inbound_email_address', {
    p_address: ourAddresses[0],
  }).single()

  if (!resolution || resolution.resolution_type === 'unknown_workspace') {
    // Не наш — но Postmark не должен был такое присылать. Логируем + возвращаем OK.
    return new NextResponse('OK (unknown workspace)', { status: 200 })
  }

  // 6. Маршрутизация по типу
  let threadId: string | null = null
  let projectId: string | null = null

  switch (resolution.resolution_type) {
    case 'thread':
      threadId = resolution.thread_id
      projectId = resolution.project_id
      break

    case 'project':
      // Создать новый тред в проекте (или append к существующему по From)
      const { data: existingThread } = await supabase
        .from('project_threads')
        .select('id')
        .eq('project_id', resolution.project_id)
        .ilike('email_last_external_address', parsed.from?.value[0]?.address ?? '')
        .eq('is_deleted', false)
        .maybeSingle()
      if (existingThread) {
        threadId = existingThread.id
      } else {
        // Создать новый тред
        const { data: newThread } = await supabase.from('project_threads').insert({
          project_id: resolution.project_id,
          workspace_id: resolution.workspace_id,
          name: parsed.subject ?? `Email от ${parsed.from?.value[0]?.address}`,
          type: 'chat',  // или 'email' если у нас будет такой type
          email_subject_root: parsed.subject,
          email_last_external_address: parsed.from?.value[0]?.address,
        }).select('id').single()
        threadId = newThread!.id
      }
      projectId = resolution.project_id
      break

    case 'virtual':
      // Применяем правило routing_mode
      // ... (логика похожая на 'project')
      break

    case 'unknown_local':
    case 'unknown_workspace':
      // Записываем в email_inbound_unmatched
      await supabase.from('email_inbound_unmatched').insert({
        workspace_id: resolution.workspace_id,
        raw_mime_path: rawPath,
        from_address: parsed.from?.value[0]?.address,
        from_name: parsed.from?.value[0]?.name,
        to_addresses: toAddresses,
        subject: parsed.subject,
        message_id_header: messageIdHeader,
        in_reply_to: parsed.inReplyTo,
        references_headers: Array.isArray(parsed.references) ? parsed.references : undefined,
        reason: resolution.resolution_type,
        spam_score: payload.SpamScore,
      })
      // TODO: notify managers (через realtime/email)
      return new NextResponse('OK (unmatched)', { status: 200 })
  }

  // 7. Fallback по In-Reply-To если threadId всё ещё null
  if (!threadId && parsed.inReplyTo) {
    const { data: parentMsg } = await supabase
      .from('project_messages')
      .select('thread_id, project_id')
      .eq('email_message_id', parsed.inReplyTo)
      .maybeSingle()
    if (parentMsg) {
      threadId = parentMsg.thread_id
      projectId = parentMsg.project_id
    }
  }

  // 8. Insert project_messages
  const { data: msg } = await supabase.from('project_messages').insert({
    thread_id: threadId,
    project_id: projectId,
    workspace_id: resolution.workspace_id,
    source: 'email_internal',
    content: parsed.html ?? parsed.text ?? '',  // HTML предпочтительно
    sender_name: parsed.from?.value[0]?.name ?? parsed.from?.value[0]?.address,
    sender_role: 'Email',
    has_attachments: (parsed.attachments?.length ?? 0) > 0,
    email_message_id: messageIdHeader,
    email_in_reply_to: parsed.inReplyTo,
    email_references: Array.isArray(parsed.references) ? parsed.references : null,
    email_subject: parsed.subject,
    email_raw_mime_path: rawPath,
    email_postmark_id: payload.MessageID,
    email_delivery_status: null,  // null для входящих
    email_metadata: {
      from: parsed.from?.value[0],
      to: parsed.to,
      cc: parsed.cc,
      headers: Object.fromEntries(parsed.headers),
    },
  }).select('id').single()

  // 9. Загрузка вложений
  for (const att of parsed.attachments ?? []) {
    const attPath = `${resolution.workspace_id}/${projectId ?? 'no-project'}/${msg.id}/${att.filename}`
    await supabase.storage.from('files').upload(attPath, att.content, {
      contentType: att.contentType,
    })
    await supabase.from('message_attachments').insert({
      message_id: msg.id,
      file_name: att.filename,
      file_size: att.size,
      mime_type: att.contentType,
      storage_path: attPath,
    })
  }

  // 10. Обновить тред — last_external_address для дедупа
  await supabase.from('project_threads').update({
    email_last_external_address: parsed.from?.value[0]?.address,
  }).eq('id', threadId!)

  return new NextResponse('OK', { status: 200 })
}
```

**Замечание:** в проде нужно вынести логику в helpers, добавить retry на storage uploads, обработку ошибок. Это псевдокод.

### 3.2 `email-internal-send` (исходящие письма)

**Деплой:** Supabase Edge Function `--no-verify-jwt`, защита через `x-internal-secret`.

**Псевдокод:**

```typescript
// supabase/functions/email-internal-send/index.ts
import { requireInternalSecret, getServiceClient, jsonRes } from '../_shared/edge.ts'

const POSTMARK_TOKEN = Deno.env.get('POSTMARK_SERVER_TOKEN') ?? ''

Deno.serve(async (req) => {
  if (!await requireInternalSecret(req)) return jsonRes({ error: 'Unauthorized' }, 401)

  const { message_id } = await req.json()
  const supabase = getServiceClient()

  // 1. Загрузить сообщение + контекст
  const { data: msg } = await supabase.from('project_messages').select(`
    id, thread_id, content, sender_name, email_subject, email_in_reply_to, email_references,
    project_threads (email_subject_root, email_last_external_address, short_id, workspace_id),
    workspaces (slug, email_active),
    message_attachments (file_name, mime_type, storage_path)
  `).eq('id', message_id).single()

  if (!msg || !msg.workspaces.email_active) return jsonRes({ skip: true })

  const fromAddress = `t+${msg.project_threads.short_id}@${msg.workspaces.slug}.clientcase.app`
  const toAddress = msg.project_threads.email_last_external_address
  if (!toAddress) return jsonRes({ error: 'No recipient' }, 400)

  // 2. Конвертация tiptap-HTML → email-safe HTML
  const safeHtml = sanitizeAndInlineStyles(msg.content)

  // 3. Подготовка вложений
  const attachments = []
  for (const att of msg.message_attachments ?? []) {
    const { data: signedUrl } = await supabase.storage
      .from('files')
      .createSignedUrl(att.storage_path, 60)
    const fileResp = await fetch(signedUrl.signedUrl)
    const buf = await fileResp.arrayBuffer()
    attachments.push({
      Name: att.file_name,
      Content: btoa(String.fromCharCode(...new Uint8Array(buf))),
      ContentType: att.mime_type,
    })
  }

  // 4. Subject — если есть прежний (Re: ...) или из этого письма
  const subject = msg.project_threads.email_subject_root
    ? `Re: ${msg.project_threads.email_subject_root}`
    : msg.email_subject ?? '(без темы)'

  // 5. Заголовки
  const messageIdHeader = `<${crypto.randomUUID()}@${msg.workspaces.slug}.clientcase.app>`
  const customHeaders = []
  if (msg.email_in_reply_to) {
    customHeaders.push({ Name: 'In-Reply-To', Value: msg.email_in_reply_to })
  }
  if (msg.email_references?.length) {
    customHeaders.push({ Name: 'References', Value: msg.email_references.join(' ') })
  }

  // 6. POST в Postmark
  const postmarkRes = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': POSTMARK_TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      From: `"${msg.sender_name}" <${fromAddress}>`,
      ReplyTo: fromAddress,
      To: toAddress,
      Subject: subject,
      HtmlBody: safeHtml,
      TextBody: htmlToPlainText(safeHtml),
      MessageStream: 'outbound',
      Headers: [{ Name: 'Message-ID', Value: messageIdHeader }, ...customHeaders],
      Attachments: attachments,
    }),
  })

  const postmarkData = await postmarkRes.json()

  if (!postmarkRes.ok) {
    await supabase.from('project_messages').update({
      email_delivery_status: 'failed',
    }).eq('id', message_id)
    return jsonRes({ error: postmarkData.Message }, 500)
  }

  // 7. Сохранить идентификаторы и статус
  await supabase.from('project_messages').update({
    email_message_id: messageIdHeader,
    email_postmark_id: postmarkData.MessageID,
    email_delivery_status: 'sent',
  }).eq('id', message_id)

  return jsonRes({ ok: true, postmark_id: postmarkData.MessageID })
})
```

### 3.3 `email-bounce-webhook` (статусы доставки)

Postmark шлёт события: Bounce, SpamComplaint, Open, Click. Один Edge Function принимает все, обновляет `email_delivery_status`. Деплой `--no-verify-jwt`, защита Basic Auth.

```typescript
// supabase/functions/email-bounce-webhook/index.ts
Deno.serve(async (req) => {
  // ... auth check ...
  const payload = await req.json()
  const recordType = payload.RecordType  // 'Bounce', 'SpamComplaint', 'Open', 'Click', 'Delivery'

  const supabase = getServiceClient()
  // Postmark MessageID — это его внутренний ID, мы храним в email_postmark_id
  const filter = supabase.from('project_messages')
    .update({ email_delivery_status: mapToStatus(recordType) })
    .eq('email_postmark_id', payload.MessageID)
  await filter
  return jsonRes({ ok: true })
})

function mapToStatus(recordType: string): string {
  switch (recordType) {
    case 'Delivery': return 'delivered'
    case 'Open': return 'opened'
    case 'Click': return 'clicked'
    case 'Bounce': return 'bounced'
    case 'SpamComplaint': return 'complaint'
    default: return 'sent'
  }
}
```

### 3.4 Расширение `provision-domain` Edge Function + bash-скрипта

**Что добавляем:**
1. Новый type в Edge Function `provision-domain`: `email`. Принимает `workspace_id`, делает всё для активации email на воркспейсе.
2. В bash-скрипте `/opt/clientcase-provision/provision.sh` — новая команда `email-setup <slug>`.

**Что делает `email-setup <slug>`:**
1. **Postmark API: добавить Sender Domain `<slug>.clientcase.app`.**
   - `POST https://api.postmarkapp.com/domains` с body `{Name: "<slug>.clientcase.app", ReturnPathDomain: "pm-bounces"}`.
   - Ответ содержит DKIMHost, DKIMTextValue, ReturnPathDomainCNAMEValue.
2. **Cloudflare API: добавить DNS-записи:**
   - MX `<slug>.clientcase.app → inbound.postmarkapp.com` priority 10.
   - DKIM TXT (значение из ответа Postmark).
   - SPF TXT `v=spf1 a mx include:spf.mtasv.net ~all` (рекомендация Postmark).
   - Return-Path CNAME (значение из ответа).
3. **Postmark API: настроить Inbound:**
   - У Sender Domain нет inbound — inbound настраивается на уровне Server. Один раз при создании Server'а.
   - Также проверить что Postmark Server (clientcase-prod) подписан на этот домен — это автоматически при добавлении Sender Domain.
4. **Запись в БД:**
   - `UPDATE workspaces SET email_postmark_domain_id = <id из ответа> WHERE id = <workspace_id>`.
5. **Запуск verification (опросная):**
   - Cron-job каждые 5 минут опрашивает Postmark `GET /domains/:id` пока DKIM/Return-Path не verified.
   - Когда verified → `UPDATE workspaces SET email_dkim_verified = true, email_return_path_verified = true, email_active = true, email_activated_at = now()`.

**Логика recovery:** если что-то сломалось на середине, повторный вызов `email-setup` идемпотентен — проверяет что уже есть, дополняет недостающее.

---

## 4. Расширение клиентского кода

### 4.1 messengerService — отправка email из UI

В `src/services/api/messenger/messengerService.ts` добавить ветку:

```typescript
// После существующей telegram + wazzup логики
if (hasAnyAttachments && params.threadId) {
  // ... существующий wazzup-блок ...
  // ... существующий telegram-блок ...

  // NEW: email-internal
  const { data: thread } = await supabase
    .from('project_threads')
    .select('email_address_active, workspaces!inner(email_active)')
    .eq('id', params.threadId)
    .maybeSingle()

  const hasEmailContext = thread?.email_address_active && thread.workspaces.email_active
    && /* check that тред уже email-канал — есть входящий email_internal */
       (await hasEmailMessages(params.threadId))

  if (hasEmailContext) {
    await supabase.auth.getSession()
    supabase.functions.invoke('email-internal-send', {
      body: { message_id: message.id, attachments_only: true },
    }).catch((err) => logger.error('Email send failed:', err))
  }
}
```

### 4.2 UI: вкладка «Email» в IntegrationsTab

Расширяем `src/page-components/workspace-settings/IntegrationsTab.tsx`:
- Левая навигация: добавить пункт «Email через ClientCase» (рядом с «Gmail»)
- Открывается `<EmailPostmarkSection workspaceId={...} />` — новый компонент

`src/page-components/workspace-settings/EmailPostmarkSection.tsx` — структура:
1. **Статус подключения:**
   - `email_active = false` → кнопка «Активировать email». Показать что будет сделано (DNS, Postmark domain).
   - `email_active = true` → показать поддомен и адреса.
2. **Адреса:**
   - Универсальный для треда: `t+<short>@<slug>.clientcase.app` — пример.
   - Универсальный для проекта: `p+<short>@<slug>.clientcase.app`.
3. **Виртуальные адреса** (компонент `VirtualAddressList`):
   - Список из `email_virtual_addresses`
   - Кнопка «Создать новый адрес» → диалог: local_part + правило маршрутизации
4. **Подпись + настройки** (через `workspace_email_settings`).

### 4.3 UI: адрес в шапке треда

В `src/components/messenger/ChatToolbar.tsx` (или соответствующем компоненте — нужно найти где сейчас показывается telegram-link):
- Если `thread.email_address_active && workspace.email_active` → показать кнопку «📧 Email»
- При клике — открывается popover с адресом `t+<short>@<slug>.clientcase.app` + кнопка «Скопировать» + ссылка «Дайте этот адрес клиенту, ответы попадут сюда».

### 4.4 UI: композер для email-тредов

Если активный тред — email (есть `email_message_id` в одном из сообщений), композер должен:
- Показывать поле «Тема» (Subject) — для первого письма.
- Поддерживать полноценное HTML-форматирование (без ограничений Telegram).
- Иметь меньшие ограничения по размеру вложений (Postmark — до 35 МБ суммарно, но Postmark может срезать).

### 4.5 Раздел «Нераспознанные письма»

`src/app/(app)/workspaces/[workspaceId]/inbox/unmatched/page.tsx`:
- Список из `email_inbound_unmatched` (только `resolved_at IS NULL`)
- Действия: «Привязать к треду» (поиск треда), «Создать тред в проекте», «Удалить как спам»

---

## 5. Безопасность

### 5.1 Защита webhook'ов

- **Postmark inbound webhook** (`/api/postmark-webhook`): Basic Auth с секретом `POSTMARK_WEBHOOK_AUTH` в Supabase secrets. URL вида `https://user:pass@my.clientcase.app/_internal/postmark-webhook`.
- **Postmark bounce webhook** (`/functions/v1/email-bounce-webhook`): тот же Basic Auth.
- **email-internal-send**: `x-internal-secret` (как у telegram-send).

### 5.2 Санитизация HTML

- **Входящие**: HTML письма пропускаются через DOMPurify перед рендером в UI (стандартная практика для writeable email-клиентов).
- **Исходящие**: HTML из tiptap → email-safe HTML (inline стили, никаких script/iframe). Используем `sanitize-html` или DOMPurify (server-side).

### 5.3 RLS

- `email_virtual_addresses`: read all participants, write only managers.
- `workspace_email_settings`: read all participants, write only managers.
- `email_inbound_unmatched`: read+update только managers.
- `project_messages` с `source='email_internal'`: те же политики что у обычных сообщений (через project_participants).

### 5.4 Шифрование

- `POSTMARK_SERVER_TOKEN` — в Supabase secrets, не в БД.
- Raw MIME в Storage — bucket `email-raw-mime` приватный, доступ через signed URLs только участникам воркспейса.

### 5.5 Антиспам

- Postmark прокидывает `SpamScore` в payload. В `resolve_inbound_email_address` проверять `spam_threshold` от виртуального адреса (если задан).
- Письма выше порога → в `email_inbound_unmatched` с reason='spam'.

### 5.6 Rate limiting на отправку

- Edge Function `email-internal-send` проверяет — не больше 100 писем в минуту с воркспейса. Защита от случайных циклов и злоупотреблений.

---

## 6. Phase breakdown — фактический порядок коммитов

### Phase 0 — Postmark setup (1 час, ручная работа)

- [ ] Регистрация на postmarkapp.com.
- [ ] Создать Server `clientcase-prod`.
- [ ] Получить Server Token, сохранить в Supabase secrets как `POSTMARK_SERVER_TOKEN`.
- [ ] Получить Account API Token (для управления доменами через API), сохранить как `POSTMARK_ACCOUNT_TOKEN`.
- [ ] Сгенерировать Basic Auth credentials для inbound webhook, сохранить в `POSTMARK_WEBHOOK_AUTH`.
- [ ] В Postmark UI: Server → Settings → Inbound:
  - Webhook URL: `https://<basicauth>@my.clientcase.app/_internal/postmark-webhook`
  - Include raw email content: ON
- [ ] План — Free, апгрейд на Pro перед первым реальным трафиком.

### Phase 1 — БД (0.5 дня)

- [ ] Применить миграцию `20260506_email_postmark_internal_setup.sql`.
- [ ] Применить RPC `resolve_inbound_email_address` и `get_thread_email_address`.
- [ ] Проверить enum, индексы, RLS.

### Phase 2 — VPS provision script + Cloudflare DNS (1 день)

- [ ] Расширить `/opt/clientcase-provision/provision.sh`:
  - `email-setup <slug>` — выполняет Postmark API + Cloudflare DNS вызовы.
  - `email-status <slug>` — возвращает статус DKIM/SPF/Return-Path.
- [ ] Добавить в `provision-domain` Edge Function ветку `type='email'`.
- [ ] Добавить в Supabase secrets:
  - `POSTMARK_SERVER_TOKEN`
  - `POSTMARK_ACCOUNT_TOKEN` (для управления доменами через Postmark API)
  - `CLOUDFLARE_API_TOKEN` (для добавления MX/TXT записей через Cloudflare API)
  - `CLOUDFLARE_ZONE_ID` (zone ID для clientcase.app в Cloudflare)
- [ ] Тест на dev-домене типа `test.clientcase.app` — пройти полный цикл активации.

### Phase 3 — Edge Function: входящие (1 день)

- [ ] Создать `src/app/api/postmark-webhook/route.ts`.
- [ ] Установить `mailparser` через npm.
- [ ] Реализовать парсинг + резолв + insert.
- [ ] **Тест:** отправить письмо на `t+1@kvp.clientcase.app` (после активации в Phase 2). Проверить что упало в БД.

### Phase 4 — Edge Function: исходящие (1 день)

- [ ] Создать `supabase/functions/email-internal-send/index.ts`.
- [ ] Применить миграцию-обновление триггера.
- [ ] Расширить messengerService (frontend invoke для attachments_only).
- [ ] **Тест:** ответить из сервиса в email-тред, проверить что письмо дошло до клиента.

### Phase 5 — Bounce webhook (0.5 дня)

- [ ] Создать `supabase/functions/email-bounce-webhook/index.ts`.
- [ ] В Postmark Server настроить webhook'и для Bounce/SpamComplaint/Open/Click.
- [ ] **Тест:** отправить на несуществующий адрес → проверить bounce → статус в БД обновился.

### Phase 6 — UI (2-3 дня)

- [ ] `EmailPostmarkSection` в IntegrationsTab.
- [ ] Кнопка «Активировать email» → invoke `provision-domain` с type='email'.
- [ ] Адрес треда в шапке (через `get_thread_email_address` RPC).
- [ ] Композер с полем Subject для email-тредов.
- [ ] CRUD виртуальных адресов (`email_virtual_addresses`).
- [ ] Раздел «Нераспознанные письма» (`email_inbound_unmatched`).

### Phase 7 — Депрекейт Gmail-приёма (отложено на месяцы)

- Когда все активные клиенты переедут — отключаем cron `gmail-watch-refresh`, deactivation Pub/Sub watch.
- Gmail остаётся как «отправка от своего ящика» (опциональная фича).

---

## 7. Vendor lock-in mitigation

### 7.1 На уровне кода

- **Парсим raw MIME через `mailparser`** — стандартный формат, не привязка к Postmark JSON.
- Postmark JSON используется только для metadata (SpamScore, MessageID), не для контента.
- Хранение `email_raw_mime_path` позволяет переслать любому другому inbound-провайдеру или повторно распарсить.

### 7.2 Замена Postmark на SES/Mailgun

Что нужно поменять:
1. DNS MX (Cloudflare API call) — указать на `inbound-smtp.us-east-1.amazonaws.com` (для SES) или `mxa.mailgun.org` (Mailgun).
2. Webhook endpoint — у каждого провайдера свой формат payload, но **парсинг raw MIME остаётся**. Меняется только обвязка `extract MIME from JSON`.
3. Outbound: `email-internal-send` меняется. SES API/Mailgun API имеют похожие интерфейсы.

**Оценочно: 2 дня работы на полный переезд.** Это план B, не приоритет.

---

## 8. Открытые вопросы перед стартом

1. **DNS-провайдер Cloudflare у нас уже подключён к домену `clientcase.app`?**
   Да — DNS управляется через Cloudflare, мы делали это при покупке. ✅
   - Нужен API-токен с правами Zone:DNS:Edit.

2. **Wildcard SSL для inbound webhook нужен?**
   Postmark POST'ит на `https://my.clientcase.app/_internal/postmark-webhook` — у нас уже работает. ✅

3. **`mailparser` совместим с Next.js 16 (Node runtime)?**
   Да, `mailparser` — обычный Node-пакет. Требуется `runtime = 'nodejs'` в API route (не edge runtime — там Node API недоступен).

4. **SPF strict vs ~all?**
   Postmark рекомендует `~all` (soft fail) — компромисс между deliverability и защитой от спуфинга. Берём.

5. **Можно ли использовать существующий Inbox-проект для unmatched?**
   В `src/app/(app)/workspaces/[workspaceId]/inbox/page.tsx` уже есть страница «Входящие». Её можно расширить вкладкой «Нераспознанные», или сделать отдельную страницу. Решить в Phase 6.

6. **Что с реакциями/edit/delete?**
   - Email не поддерживает reactions нативно. В UI юзер ставит реакцию — она остаётся только в нашем сервисе (как для Wazzup business).
   - Edit/delete: Email не поддерживает. После отправки — ничего нельзя.

7. **Subject-line strategy для исходящих:**
   - Если в треде уже есть `email_subject_root` — отвечаем `Re: <root>`.
   - Если первое письмо в треде — берём из UI (поле Subject в композере).
   - Если поле Subject пустое — `(без темы)`. Не ок для UX. **Решение: при первом исходящем письме в треде показывать модалку «введите тему».**

8. **Headers «Auto-Submitted»?**
   Для auto-reply — да, добавлять `Auto-Submitted: auto-replied` в headers, чтобы не создавать петли.

---

## 9. Метрики успеха

- ✅ 100% писем на корректный внутренний адрес попадают в правильный тред.
- ✅ 95%+ ответов клиентов матчатся через References (когда адрес-получатель не наш — например, клиент сделал «Reply All»).
- ✅ Доставляемость ≥ 98% (Postmark deliverability dashboard).
- ✅ Активация email на новом воркспейсе ≤ 10 мин (включая DNS-верификацию).
- ✅ Latency приёма входящего: ≤ 5 секунд от момента когда Postmark получил → видно в UI треда.
- ✅ Готовность к смене провайдера: ≤ 2 дня работы на переезд.

---

## 10. Что точно НЕ делаем в этой итерации

- ❌ Custom-домены клиентов для email (только `<slug>.clientcase.app`). Custom-домены для веба — да, для email — отложено.
- ❌ Маркетинговые рассылки.
- ❌ PGP/S/MIME шифрование.
- ❌ Поиск по архиву писем (можно сделать через PG full-text позже).
- ❌ Sync email → CRM-карточки контактов.
- ❌ Multi-mailbox (несколько подключённых ящиков на воркспейс через IMAP) — это другая фича.
- ❌ Шаблоны исходящих писем — отдельная задача.

---

## 11. Готовность

Документ покрывает:
- ✅ Полные SQL-миграции (готовы к применению)
- ✅ RPC с подробной логикой резолва адресов
- ✅ Псевдокод обоих edge functions (postmark-webhook + email-internal-send)
- ✅ Phase breakdown с конкретными задачами и файлами
- ✅ Безопасность по слоям
- ✅ Открытые вопросы на старте
- ✅ Vendor lock-in mitigation
- ✅ Метрики успеха

**Готов начать с Phase 0 (Postmark регистрация) после твоего OK.**
