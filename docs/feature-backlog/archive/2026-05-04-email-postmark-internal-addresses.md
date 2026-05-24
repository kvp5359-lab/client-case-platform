# ТЗ: Имейл через внутренние адреса (Postmark + поддомены воркспейсов)

**Дата:** 2026-05-04
**Статус:** ⚠️ **УСТАРЕЛО** — заменено на гибридную модель (Planfix + прямые адреса).
**Актуальный план:** [`2026-05-06-email-postmark-implementation-plan.md`](./2026-05-06-email-postmark-implementation-plan.md)
**Автор:** обсуждение с Claude

> Этот документ описывает только **канал B** (прямые адреса `t+<short>@`,
> `p+<short>@`, виртуальные). Актуальная архитектура добавляет **канал A**
> (Planfix-style: подключённый ящик сотрудника + forward на `inbox@`),
> оба канала работают одновременно. См. ссылку выше.

---

## 1. Проблема и контекст

### 1.1 Что есть сейчас

Сейчас в проекте реализована интеграция почты **только через Gmail OAuth** (см. `supabase/functions/gmail-*`):
- Сотрудник подключает свой Google-аккаунт через OAuth.
- Используется Gmail API + Pub/Sub watch-механизм для приёма писем.
- Watch-подписки протухают каждые 7 дней, продлеваются pg_cron-джобом `gmail-watch-refresh`.
- Таблицы `email_accounts`, `email_chat_link`, edge functions: `gmail-auth`, `gmail-callback`, `gmail-disconnect`, `gmail-send`, `gmail-watch-refresh`, `gmail-webhook`, `email-track`.

### 1.2 Зачем менять

1. **Привязка к одному провайдеру.** Подключить Яндекс, Mail.ru, корпоративный Outlook/Exchange — это новая интеграция с нуля для каждого.
2. **Хрупкость watch-механизма.** Watch-подписки регулярно отваливаются. Уже был инцидент — клиенты неделю не получали входящие.
3. **Лимиты Google для не-верифицированных приложений.** В режиме testing — потолок 100 пользователей.
4. **Сложности масштабирования.** Каждый Gmail-аккаунт = отдельные токены, отдельные точки отказа.

### 1.3 Решение

Перейти на модель **внутренних имейл-адресов с поддоменом на воркспейс** (как в Planfix):

- Куплен домен **`clientcase.app`**.
- Каждому воркспейсу выделяется свой поддомен: `<workspace-slug>.clientcase.app` (например, `kvp.clientcase.app`).
- Внутри поддомена — два типа адресов:
  - **Виртуальные** (создаются пользователем) с правилами маршрутизации: `support@kvp.clientcase.app`, `hh@kvp.clientcase.app`.
  - **Автоматические на тред / проект**: `t+abc123@kvp.clientcase.app`, `p+xyz789@kvp.clientcase.app`.
- Приём и отправка — через **Postmark** (план Platform — Unlimited custom domains).
- Provider-agnostic: клиенту всё равно, какой у него почтовый провайдер — он пишет на наш адрес, мы получаем стандартный MIME.

Существующая Gmail-интеграция остаётся как опциональная фича «отправка от имени сотрудника из его Gmail» (см. раздел 9).

---

## 2. Цели и не-цели

### Цели

- Принимать входящую почту от любых внешних провайдеров через единый канал.
- Отправлять исходящую почту с внутренних адресов через единый канал.
- Сохранять историю переписки в БД и raw MIME — в Storage.
- Корректно маршрутизировать ответы клиентов в существующие треды.
- Поддерживать вложения (приём + отправка).
- **Виртуальные адреса с правилами** (как у Planfix): `support@`, `leads@`, etc. — пользователь сам создаёт.
- **Поддомен на воркспейс** — для брендирования и изоляции.
- Минимизировать vendor lock-in (готовность сменить Postmark на SES / собственный Postfix).
- Стартовать на Postmark Free для разработки.

### Не-цели (на этом этапе)

- Маркетинговые рассылки и аналитика open-rate.
- Расшаривание ящика между сотрудниками с разными статусами «прочитано».
- Полнотекстовый поиск по архиву писем (отложено).
- Шифрование писем (PGP/S/MIME).
- Полное удаление Gmail-интеграции (см. раздел 9 — гибрид).
- Свой Postfix-сервер (отложено на Stage 3, см. раздел 11).

---

## 3. Архитектурный обзор

### 3.1 Поток входящего письма

```
Клиент пишет email на support@kvp.clientcase.app
         ↓
DNS *.clientcase.app  MX → Postmark inbound (inbound.postmarkapp.com)
         ↓
Postmark парсит MIME, генерирует JSON с RawEmail
         ↓
POST на https://<supabase>.functions/v1/email-inbound-webhook
         ↓
Edge Function:
  1. Проверяет Basic Auth
  2. Парсит сырой MIME (для надёжности и независимости от Postmark JSON)
  3. Извлекает поддомен из адреса получателя → находит workspace
  4. Извлекает локальную часть → виртуальный адрес ИЛИ thread/project токен
  5. Применяет правила маршрутизации виртуального адреса (если задано)
  6. Дополнительно матчит через In-Reply-To / References
  7. Кладёт raw MIME в Storage
  8. Создаёт project_messages + message_attachments
  9. Триггерит реалтайм-обновления и нотификации
```

### 3.2 Поток исходящего письма

```
Сотрудник пишет ответ в треде сервиса
         ↓
project_messages вставляется с source='email_internal'
         ↓
PG-триггер маршрутизирует исходящие email
         ↓
HTTP POST на email-internal-send Edge Function
         ↓
Edge Function:
  1. Конвертирует HTML (tiptap) → email-safe HTML
  2. Прикрепляет attachments через signed URLs из Storage
  3. Формирует From: "Иван Иванов" <t+abc123@kvp.clientcase.app>
  4. Reply-To: тот же
  5. In-Reply-To / References для thread continuity
  6. POST в Postmark API (правильный Server token для воркспейса)
  7. Сохраняет email_message_id, email_postmark_id
```

### 3.3 Адресная схема

**Формат:** `<local-part>@<workspace-slug>.clientcase.app`

#### Поддомен — workspace slug

- Каждый воркспейс при создании регистрируется в Postmark как отдельный sender domain через API.
- Slug — латиница + цифры + дефис, формируется из имени воркспейса автоматически + проверка уникальности.
- Slug нельзя переименовать после регистрации (это сломает существующие переписки) — задаётся один раз.

#### Локальная часть — три типа

**1. Виртуальные адреса** (создаёт пользователь):
```
support@kvp.clientcase.app
hh@kvp.clientcase.app
leads@kvp.clientcase.app
```
- Привязаны к правилам маршрутизации: «всё с этого адреса → проект X / тред Y / создать новый тред в проекте Z».
- См. раздел 6 «Виртуальные адреса с правилами».

**2. Автоматические адреса тредов** (генерируются автоматически):
```
t+<token>@kvp.clientcase.app   ← конкретный тред (любого типа: чат, задача, документ)
```
- Токен — 12 символов base32 (без 0/O/1/I/L), энтропия ~60 бит.
- Генерируется лениво — при первом «нужно показать адрес» (открытие треда).
- Адрес видно в шапке треда, кнопка «копировать».

**3. Автоматические адреса проектов**:
```
p+<token>@kvp.clientcase.app   ← общий вход в проект
```
- Письмо на этот адрес создаёт новый тред в проекте (или попадает в дефолтный, если настроено).

#### Адреса на сотрудника — отложены

Раньше планировалось `u+<token>@...`. Отложено до второй итерации — пересекается с системным инбоксом TG Business.

### 3.4 Тред-матчинг (приоритет)

1. **По автоадресу `t+<token>@`** — кладём в этот тред.
2. **По виртуальному адресу + правилам** — применяем правило (см. раздел 6).
3. **По адресу проекта `p+<token>@`** — ищем существующий открытый тред с этим `From` в проекте; если есть — туда; иначе — создаём новый.
4. **По заголовкам `In-Reply-To` / `References`** — если адрес-получатель не наш или без токена.
5. **По slug + From** — последний fallback: ищем открытый тред с этим клиентом в воркспейсе.
6. **Не нашли** — в `email_inbound_unmatched`, нотификация менеджеру воркспейса.

### 3.5 Хранение

- **Сырой MIME** → Supabase Storage, bucket `email-raw-mime`, путь `<workspace_id>/<year>/<month>/<message_uuid>.eml.gz` (gzip).
- **Распарсенные поля** → `project_messages` с `source='email_internal'`.
- **Вложения** → Storage `files/<workspace>/<project>/<message>/<filename>` (как у других каналов).

---

## 4. Изменения в БД

### 4.1 Новая таблица: `workspace_email_domains`

Хранит привязку воркспейса к поддомену в Postmark.

```sql
CREATE TABLE workspace_email_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,                     -- 'kvp', формирует поддомен kvp.clientcase.app
  full_domain text NOT NULL UNIQUE,              -- 'kvp.clientcase.app'
  postmark_domain_id text,                       -- ID домена в Postmark API
  postmark_server_token text,                    -- зашифрованный токен Postmark Server
  dns_status text NOT NULL DEFAULT 'pending',    -- 'pending' / 'verified' / 'failed'
  dkim_verified boolean NOT NULL DEFAULT false,
  spf_verified boolean NOT NULL DEFAULT false,
  return_path_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz
);
```

**RLS:** SELECT — участникам воркспейса. INSERT/UPDATE — только service role (через RPC + Edge Function).

### 4.2 Новая таблица: `email_thread_addresses`

Автоматические адреса тредов и проектов.

```sql
CREATE TABLE email_thread_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  address_type text NOT NULL CHECK (address_type IN ('thread', 'project')),
  token text NOT NULL,                           -- 12 base32 символов
  thread_id uuid REFERENCES project_threads(id) ON DELETE CASCADE,
  project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  rotated_from text,
  UNIQUE (workspace_id, token),
  CHECK (
    (address_type = 'thread' AND thread_id IS NOT NULL AND project_id IS NULL) OR
    (address_type = 'project' AND project_id IS NOT NULL AND thread_id IS NULL)
  )
);
CREATE INDEX idx_email_thread_addresses_lookup
  ON email_thread_addresses(workspace_id, token) WHERE is_active;
CREATE INDEX idx_email_thread_addresses_thread
  ON email_thread_addresses(thread_id) WHERE is_active;
```

### 4.3 Новая таблица: `email_virtual_addresses`

Пользовательские виртуальные адреса с правилами маршрутизации.

```sql
CREATE TABLE email_virtual_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  local_part text NOT NULL,                      -- 'support', 'hh', 'leads'
  display_name text,                             -- 'Поддержка клиентов'
  description text,
  is_active boolean NOT NULL DEFAULT true,

  -- правила маршрутизации
  routing_mode text NOT NULL DEFAULT 'create_thread'
    CHECK (routing_mode IN (
      'create_thread',                           -- создать новый тред в проекте
      'append_to_existing_thread',               -- если открыт тред с этим клиентом — туда
      'fixed_thread'                             -- всегда в один и тот же тред
    )),
  target_project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  target_thread_id uuid REFERENCES project_threads(id) ON DELETE SET NULL,
  default_thread_template_id uuid REFERENCES thread_templates(id),
  default_assignee_user_id uuid REFERENCES auth.users(id),

  -- доп. опции
  auto_reply_enabled boolean NOT NULL DEFAULT false,
  auto_reply_text text,
  spam_threshold int DEFAULT 5,                  -- если Spam-Score выше → в trash

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE (workspace_id, local_part)
);
```

**RLS:** SELECT — участникам воркспейса. INSERT/UPDATE/DELETE — только менеджерам (с правом `manage_workspace_settings`).

### 4.4 Новая таблица: `email_inbound_unmatched`

```sql
CREATE TABLE email_inbound_unmatched (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  raw_mime_path text NOT NULL,
  from_address text NOT NULL,
  to_addresses text[] NOT NULL,
  subject text,
  received_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  resolved_thread_id uuid REFERENCES project_threads(id)
);
```

### 4.5 Расширение `project_messages`

```sql
ALTER TYPE message_source ADD VALUE 'email_internal';
ALTER TABLE project_messages
  ADD COLUMN email_message_id text,            -- RFC 5322 Message-ID
  ADD COLUMN email_in_reply_to text,
  ADD COLUMN email_references text[],
  ADD COLUMN email_raw_mime_path text,
  ADD COLUMN email_postmark_id text,
  ADD COLUMN email_subject text,
  ADD COLUMN email_delivery_status text;       -- sent/delivered/bounced/complaint/opened
CREATE UNIQUE INDEX idx_project_messages_email_msgid
  ON project_messages(email_message_id)
  WHERE email_message_id IS NOT NULL;
```

### 4.6 Расширение `project_threads`

```sql
ALTER TABLE project_threads
  ADD COLUMN email_address_cached text,        -- 't+abc123@kvp.clientcase.app' для быстрого доступа
  ADD COLUMN email_subject_root text;          -- оригинальная тема первого письма
```

Поле `email_chat_link` оставляем для legacy Gmail-интеграции.

### 4.7 Системный инбокс «нераспознанных»

```sql
ALTER TABLE projects
  ADD COLUMN is_system_email_inbox boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX uq_projects_system_email_inbox_per_ws
  ON projects(workspace_id) WHERE is_system_email_inbox;
```

Скрывается в `useSidebarData` и RPC `get_user_projects` / `get_workspace_threads` (по аналогии с `is_system_business_inbox`).

### 4.8 Настройки почты воркспейса

```sql
CREATE TABLE workspace_email_settings (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  default_from_name text,                       -- "ClientCase" или название воркспейса
  signature_html text,                          -- общая подпись для всех исходящих
  reply_quote_style text DEFAULT 'gmail',       -- стиль цитирования при reply
  spam_filter_strict boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

---

## 5. Edge Functions

### 5.1 `email-inbound-webhook`

**Деплой:** `--no-verify-jwt`. Защита через Basic Auth в URL Postmark webhook'а.

**Вход:** Postmark JSON payload с `RawEmail` (base64).

**Логика:**
1. Проверить Basic Auth.
2. Декодировать `RawEmail` → распарсить через `mailparser` (или аналог для Deno).
3. Загрузить raw MIME в Storage.
4. Извлечь домен получателя → найти `workspace_email_domains` по `full_domain`.
5. Если воркспейс не найден → положить в `email_inbound_unmatched` с `reason='unknown_domain'`.
6. Извлечь локальную часть, определить тип:
   - Если начинается с `t+` → искать в `email_thread_addresses` (type=thread).
   - Если начинается с `p+` → искать (type=project).
   - Иначе → искать в `email_virtual_addresses` по `local_part`.
7. Применить логику маршрутизации (см. 3.4).
8. Создать `project_messages` + `message_attachments`.
9. Загрузить вложения в Storage.
10. Вернуть 200.

**Идемпотентность:** дедуп по `email_message_id` (уникальный индекс).

### 5.2 `email-internal-send`

**Деплой:** `--no-verify-jwt`, защита через `x-internal-secret`.

**Вход:** `{ message_id }`.

**Логика:**
1. Загрузить `project_messages` + `project_threads` + `workspace_email_domains` (для server token).
2. Конвертировать tiptap-HTML → email-safe HTML (inline стили).
3. Сформировать заголовки: `From`, `Reply-To`, `In-Reply-To`, `References`, `Message-ID`, `Subject`.
4. Прикрепить вложения через signed URLs из Storage.
5. POST в Postmark API: `https://api.postmarkapp.com/email` с правильным `X-Postmark-Server-Token`.
6. Сохранить `email_postmark_id`, `email_message_id`.

### 5.3 `email-bounce-webhook`

Postmark шлёт `Bounce`, `SpamComplaint`, `Open`, `Click` события. Обновляет `project_messages.email_delivery_status`.

### 5.4 `email-provision-workspace-domain`

Регистрирует поддомен воркспейса в Postmark.

**Вход:** `{ workspace_id, slug }` (вызывается при создании воркспейса или активации почты).

**Логика:**
1. Создать поддомен `<slug>.clientcase.app` через DNS API (Cloudflare).
2. Создать Sender Domain в Postmark через API (POST `/domains`).
3. Получить от Postmark DNS-записи (DKIM, Return-Path).
4. Добавить эти записи в Cloudflare через API.
5. Создать Postmark Server для воркспейса (изоляция reputation).
6. Записать `workspace_email_domains` с `dns_status='pending'`.
7. Запустить фоновую проверку через `email-verify-domain` (опрашивать Postmark, пока не verified).

### 5.5 `email-verify-domain`

Опрашивает Postmark, обновляет `dns_status`, `dkim_verified`, etc. Вызывается через cron каждые 5 минут до verified, потом останавливается.

### 5.6 `email-rotate-token`

RPC + Edge Function для ротации токена адреса треда (если адрес «утёк»). Старый токен помечается inactive, 30 дней принимает с пометкой.

---

## 6. Виртуальные адреса с правилами

Главная UX-фича по образцу Planfix.

### 6.1 Сценарии использования

**Сценарий A: общий ящик «поддержка»**
- Пользователь создаёт `support@kvp.clientcase.app`.
- Правило: «новое письмо → создать тред в проекте «Поддержка», шаблон — `client_inquiry`, исполнитель — Иван».
- Клиенты пишут на этот адрес → автоматически появляются треды в нужном проекте с нужным исполнителем.

**Сценарий B: «лиды»**
- Адрес `leads@kvp.clientcase.app`.
- Правило: «создать тред в проекте «Воронка продаж», статус = «Новый лид»».
- Удобно дать этот адрес на сайте/визитке.

**Сценарий C: «уведомления от партнёра»**
- Адрес `notifications@kvp.clientcase.app`.
- Правило: «всегда в один и тот же тред «Уведомления от XYZ» в проекте «Системные»».
- Удобно для DocuSign / госуслуг / любых системных уведомлений.

**Сценарий D: один проект — один адрес**
- В каждом проекте можно завести `<project-slug>@kvp.clientcase.app` — всё, что туда пишут, падает в проект.

### 6.2 Структура правила (см. таблицу 4.3)

- `routing_mode`:
  - `create_thread` — каждое новое письмо = новый тред.
  - `append_to_existing_thread` — если есть открытый тред с этим `From` в проекте → туда; иначе создать.
  - `fixed_thread` — все письма в один заданный тред.
- `target_project_id` — куда создавать треды.
- `target_thread_id` — для `fixed_thread`.
- `default_thread_template_id` — какой шаблон применить к новому треду.
- `default_assignee_user_id` — кого назначить ответственным.
- `auto_reply_enabled` + `auto_reply_text` — автоответ клиенту (например, «Спасибо за обращение, ответим в течение 24 часов»).

### 6.3 UI

Страница `/workspaces/[id]/settings/email/virtual-addresses`:
- Список созданных адресов с правилами.
- Кнопка «Создать адрес»: form с полем `local_part` (валидация — только латиница, дефисы), правилами маршрутизации, опциональным auto-reply.
- Для каждого адреса — статистика: «получено писем за месяц», «создано тредов».
- Кнопка «Деактивировать» / «Удалить».

---

## 7. UI

### 7.1 Адрес треда в шапке

В шапке треда добавляется блок:
- Иконка email.
- Адрес `t+abc123@kvp.clientcase.app`.
- Кнопка «Скопировать».
- Тултип: «Дайте этот адрес клиенту — все ответы попадут в этот тред».

### 7.2 Создание тредов из писем

Когда приходит письмо на виртуальный/проектный адрес — создаётся тред типа `email`. UI отрисовывает с email-иконкой, имя клиента из `From`.

### 7.3 Раздел «Нераспознанные письма»

`/workspaces/[id]/inbox/unmatched` (видна менеджерам):
- Список писем из `email_inbound_unmatched`.
- Действия: «Привязать к треду», «Создать новый тред в проекте», «Удалить как спам».

### 7.4 Настройки воркспейса

`/workspaces/[id]/settings/email`:
- **Вкладка «Домен»**: показ поддомена `kvp.clientcase.app`, статус DNS-верификации, DKIM/SPF/Return-Path, кнопка «Перепроверить».
- **Вкладка «Виртуальные адреса»**: см. 6.3.
- **Вкладка «Подпись и оформление»**: общая подпись для исходящих, стиль цитирования.
- **Вкладка «Импорт переписок»** (опционально, отложено): миграция из существующих почтовых ящиков.

### 7.5 Композер для отправки

В `MessageBubble` / `Composer` для email-тредов:
- Поле «Тема» (для первого письма; в reply — автоматом «Re: …»).
- Полный rich-text без ограничений.
- Опция «Подгрузить вложения».

---

## 8. Безопасность

1. **Basic Auth для inbound webhook** — обязательно.
2. **HTML-санитизация** через DOMPurify перед отправкой и перед рендером входящих.
3. **Rate limiting** на `email-internal-send` — N писем в минуту с воркспейса.
4. **Spam check** — проверка `Spam-Score` заголовка (Postmark проставляет), писать в trash при `>= spam_threshold`.
5. **DKIM/SPF/DMARC** — обязательны для **каждого поддомена**, иначе исходящие в спам.
6. **Storage RLS** — bucket `email-raw-mime` приватный, доступ через signed URL участникам воркспейса.
7. **Token entropy** — 12 base32 = ~60 бит, угадывание невозможно.
8. **Шифрование Postmark Server Token** в БД — через pg_sodium или Vault.
9. **Логи** — никогда не логировать содержимое писем, только Message-ID и адреса.
10. **Изоляция воркспейсов** — отдельный Postmark Server на воркспейс, чтобы один «спамящий» воркспейс не утянул репутацию остальных.

---

## 9. Миграция с текущего Gmail

### 9.1 Что оставляем

- Edge functions `gmail-*` оставляем работающими.
- Gmail OAuth — становится опциональной фичей «отправка от моего Gmail».

### 9.2 Что отключаем (через 2-3 месяца после запуска нового канала)

- Pub/Sub watch (cron `gmail-watch-refresh`) — отключение приёма через Gmail.
- Это снимает бремя поддержки watch-refresh.

### 9.3 План миграции для текущей переписки

**Текущий объём:** 1-2 письма в день (фактический, см. обсуждение). Миграция тривиальна.

1. Параллельная работа: новый канал поднимается, старый Gmail продолжает.
2. Существующие переписки → продолжают идти через Gmail.
3. Новые контакты → сразу новый внутренний адрес.
4. Бэкфилл существующих писем не делаем.
5. Через 2-3 месяца — disable Gmail inbound, оставить только OAuth-отправку.

---

## 10. План реализации (фазы)

### Фаза 0 — подготовка (1 день)

- [ ] Купить домен `clientcase.app` (Hostinger или Cloudflare Registrar — рекомендую CF, там без наценок).
- [ ] Настроить DNS у Cloudflare (NS-записи на CF).
- [ ] Зарегистрировать аккаунт Postmark **Free**.
- [ ] Создать Postmark Server `clientcase-dev`.
- [ ] Зарегистрировать первый поддомен `kvp.clientcase.app` (в одиночку — без автоматизации).
- [ ] Настроить DNS вручную: MX, DKIM, SPF, Return-Path для `kvp.clientcase.app`.
- [ ] Дождаться валидации в Postmark.
- [ ] Создать секреты в Supabase: `POSTMARK_SERVER_TOKEN_KVP`, `POSTMARK_INBOUND_WEBHOOK_AUTH`, `CLOUDFLARE_API_TOKEN`.

### Фаза 1 — приём писем для одного воркспейса (1-2 дня)

- [ ] Миграции: `workspace_email_domains`, `email_thread_addresses`, `email_virtual_addresses`, `email_inbound_unmatched`, расширения `project_messages` / `project_threads` / `projects` / `workspace_email_settings`.
- [ ] Edge function `email-inbound-webhook` (парсинг MIME, дедуп, базовая маршрутизация по поддомену + локальной части).
- [ ] Создание системного инбокса для нераспознанных.
- [ ] RPC для генерации внутренних адресов тредов.
- [ ] Тест: отправить себе на `t+xxx@kvp.clientcase.app`, убедиться что упало в тред.

### Фаза 2 — отправка писем (1 день)

- [ ] Edge function `email-internal-send`.
- [ ] PG-триггер для роутинга исходящих email-сообщений.
- [ ] HTML→email-safe конвертация.
- [ ] Поддержка вложений в обе стороны.
- [ ] Тест: ответить из сервиса, убедиться что клиент получил.

### Фаза 3 — виртуальные адреса с правилами (2 дня)

- [ ] Хуки: `useEmailVirtualAddresses`, `useCreateVirtualAddress`, etc.
- [ ] UI страница виртуальных адресов в настройках воркспейса.
- [ ] Логика применения правил в `email-inbound-webhook`.
- [ ] Auto-reply через `email-internal-send`.

### Фаза 4 — UI треда и настроек (2 дня)

- [ ] Адрес треда в шапке.
- [ ] Композер с полем «Тема» для email-тредов.
- [ ] Раздел «Нераспознанные письма».
- [ ] Настройки домена воркспейса.

### Фаза 5 — bounce / delivery статусы (0.5 дня)

- [ ] Edge function `email-bounce-webhook`.
- [ ] Индикатор статуса в UI (`sent` / `delivered` / `bounced`).

### Фаза 6 — автопровижининг доменов для новых воркспейсов (1-2 дня)

- [ ] Edge function `email-provision-workspace-domain`.
- [ ] Edge function `email-verify-domain` + cron-джоба.
- [ ] При создании воркспейса (или ручной активации почты) — автоматически создаётся поддомен в Cloudflare + регистрируется в Postmark.
- [ ] Апгрейд плана Postmark с Free до Platform ($18/мес) — когда понадобится больше 1 поддомена.

### Фаза 7 — депрекейт Gmail-приёма (отложено на месяцы)

- [ ] Деактивация Pub/Sub watch.
- [ ] Удаление cron'а `gmail-watch-refresh`.
- [ ] Удаление inbound-ветки в `gmail-webhook`.
- [ ] Обновление документации.

---

## 11. Эволюция инфраструктуры (Stages)

### Stage 1 (текущий MVP)

- Postmark Free → Pro ($16.50/мес) при активном использовании одного воркспейса.
- Один поддомен `kvp.clientcase.app`.

### Stage 2 — масштабирование на десятки воркспейсов

- Переход на Postmark Platform ($18/мес) — Unlimited custom domains.
- Автопровижининг поддоменов для новых воркспейсов.
- Эту стадию делаем когда появится второй воркспейс.

### Stage 3 — собственный Postfix-сервер (далёкое будущее)

Когда становится осмысленным:
- 100+ активных воркспейсов с реальным трафиком.
- Объём писем перевалит 100 000 в месяц (на Postmark уже $130+).
- Появится разработчик/админ с навыками поддержки почтовых серверов.

Что меняется:
- Wildcard MX `*.clientcase.app` → свой Postfix-сервер (Hetzner / DigitalOcean).
- Postfix принимает всё, шлёт в наш inbound-webhook напрямую.
- Postmark остаётся **только для исходящих** (репутация прогретого IP важна больше, чем экономия).

**Архитектурный задел уже сделан:** парсим raw MIME сами, не привязываемся к Postmark JSON. Переезд = смена источника MIME, бизнес-логика остаётся.

---

## 12. Vendor lock-in mitigation

1. **Парсим raw MIME сами** через общий хелпер `_shared/parseMime.ts`. Не используем Postmark JSON-поля как primary source.
2. **Источник входящих абстрагирован.** Webhook: `extractMime(req) → parseMime → routeMessage`. Меняется только первая функция.
3. **Отправка через стандартный REST API.** Postmark, SES, Mailgun — близкие интерфейсы.
4. **Хранение Message-ID** позволяет reconciling после переезда.
5. **DNS у Cloudflare**, не у Postmark — переезд провайдера = смена MX, не миграция домена.

---

## 13. Закрытые архитектурные решения

| Вопрос | Решение |
|--------|---------|
| Домен | `clientcase.app` (куплен 2026-05-04, ~14 €/год) |
| Основной домен приложения | `my.clientcase.app` (корень `clientcase.app` — редирект на `my.`, в будущем маркетинг) |
| Адресная схема почты | Поддомен на воркспейс: `<slug>.clientcase.app` (только MX, без HTTP) |
| Виртуальные адреса | Да, с правилами маршрутизации (как у Planfix) |
| Гранулярность автоадресов | На каждый тред + на каждый проект |
| Адреса на сотрудника | Отложено до второй итерации |
| Inbound-провайдер | Postmark (Free → Pro → Platform по мере роста) |
| DNS-провайдер | Cloudflare (бесплатный, удобный API) |
| Слой отправки | Postmark API |
| Cloudflare Email Routing | НЕ используем — Postmark Platform даёт unlimited domains нативно |
| Свой Postfix | Stage 3, не сейчас |
| Миграция текущей переписки | Параллельная работа Gmail + Postmark, без бэкфилла |
| Подход к raw MIME | Парсим сами, чтобы не зависеть от Postmark JSON |

---

## 14. Открытые вопросы (на момент имплементации)

1. **Slug для текущего воркспейса** — `kvp`? Любой другой? Решить до Фазы 0.
2. **Что делать с CC/BCC.** Первая итерация — игнорируем при отправке, на приёме сохраняем список.
3. **Лимит вложений на письмо** — Postmark принимает до 35 МБ. Внутренний лимит проекта какой?
4. **Ротация токенов адресов** — 30 дней grace-period после ротации, потом в unmatched. Подтвердить.
5. **Запрет на изменение slug воркспейса после регистрации** — UI должен блокировать. Альтернатива: разрешить, но создавать редирект-правило в Postmark + предупреждение.
6. **Subject первого письма от клиента** — использовать как название треда автоматически? Или показывать диалог «изменить название»?
7. **Что показывать клиенту в From** — `"Иван Иванов" <t+abc@kvp.clientcase.app>` или `"Иван Иванов via ClientCase" <t+abc@kvp.clientcase.app>`?

---

## 15. Метрики успеха

- 100% писем на корректный внутренний адрес попадают в правильный тред.
- 95%+ ответов клиентов корректно матчатся через References (когда адрес-получатель не наш).
- Доставляемость исходящих ≥ 98% (по статистике Postmark).
- Нулевой простой при росте — никаких watch-refresh-incidents.
- Время от создания воркспейса до готовности почты — ≤ 10 минут (включая DNS-верификацию).
- Готовность к смене провайдера: переезд на SES оценивается ≤ 2 дней работы.
