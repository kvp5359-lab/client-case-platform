# ТЗ на реализацию email — продолжение через Resend

**Дата:** 2026-05-09
**Базируется на:** [`./2026-05-06-email-postmark-implementation-plan.md`](./2026-05-06-email-postmark-implementation-plan.md) (v3 — гибридная модель).
**Статус:** конкретный execution-план с учётом Resend вместо Postmark.

---

## 0. Контекст

Архитектура (гибридная: Planfix-style + прямые адреса) описана в плане v3. Этот документ — execution-план, фиксирующий:

- Замену Postmark → Resend в инфраструктуре.
- Конкретные шаги по фазам — что делает Claude, что делает пользователь.
- Решения по 6 открытым вопросам v3.

---

## 1. Зафиксированные решения

### 1.1 Провайдер — Resend

**Причина:** Postmark деактивировал аккаунт пользователя, ждать 1-3 дня без гарантии.

**Что меняется относительно v3:**

- Webhook URL и формат payload — Resend.
- В webhook'е приходят только метаданные (без body) — нужен дополнительный API-call к Resend за полным письмом.
- Sender Domain настраивается в Resend через API.
- API ключи: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.

**Что НЕ меняется:**

- Вся БД-схема (миграция `20260506_email_hybrid_setup.sql`).
- Все RPC (`resolve_inbound_email_address`, `match_inbound_email`, `get_thread_email_address`).
- Триггер `notify_telegram_on_new_message` с веткой `email_internal`.
- Структура edge function `email-internal-send` (меняется только URL отправки + формат payload).
- UI (вкладка «Email» в settings, композер с toggle, нераспознанные письма).
- Phase breakdown — те же 8 фаз, только Phase 0 теперь «Resend setup».

### 1.2 Старт — с тестового воркспейса demo

Активируем email сначала на `demo.clientcase.app` (тестовая компания). Если что-то сломается — рабочий воркспейс `rs.clientcase.app` не пострадает.

После тестирования (2-3 дня стабильной работы) — активируем на `rs`.

### 1.3 Гибрид: оба канала параллельно

- Фазы 1-3 (БД + Postmark webhook + резолв адресов) реализуют **канал B** (прямые адреса `t+15@`, `p+3@`, виртуальные).
- Фазы 4-5 (подключение ящиков + auto-forward) реализуют **канал A** (Planfix-style через Gmail/SMTP).
- Фаза 6 (`email-internal-send`) поддерживает оба метода с переключателем.

### 1.4 Forward-адрес — один на воркспейс

`inbox@<slug>.clientcase.app`. Сотрудник определяется из From-заголовка пересланного письма. При необходимости позже добавим `inbox+<employee_id>@`.

### 1.5 IMAP — да, но во второй итерации

В первой итерации только SMTP-отправка (без копирования в папку «Отправленные» сотрудника). Во второй — добавим IMAP append для синка с Sent.

### 1.6 SMTP-пароли — pgsodium

Стандартное симметричное шифрование. Расшифровка только в edge function.

### 1.7 Cc/Bcc

В первой итерации игнорируем при отправке (только To). На приёме сохраняем для информации. Чекбокс «Ответить всем» — отложен.

### 1.8 Дедуп

Через unique-индекс на `email_message_id` (уже в плане v3).

---

## 2. Что нужно от пользователя — Phase 0

### 2.1 Регистрация на Resend (5 минут)

1. Зайти на https://resend.com → Sign up (можно через GitHub).
2. Подтвердить email.

### 2.2 Получить API ключ

1. Dashboard → API Keys → Create API Key.
2. Permissions: **Full Access**.
3. Скопировать ключ (показывается один раз — `re_xxxxxxxxxx`).

### 2.3 Webhook secret

Просто придумать случайную строку:

```bash
openssl rand -hex 32
```

### 2.4 Передать Claude

Отправить три значения (можно прямо в чат):

- `RESEND_API_KEY = re_xxx...`
- `RESEND_WEBHOOK_SECRET = <секрет>`
- (Опционально) Cloudflare API token для домена `clientcase.app` — если хочешь чтобы DNS-записи создавались автоматически. Если нет — добавим руками для первых 1-2 поддоменов.

После этого Claude добавляет всё в Supabase secrets и продолжает Phase 1.

---

## 3. Phase breakdown с разделением ролей

### Phase 0 — Resend setup (½ дня)

| Шаг | Кто |
|-----|-----|
| Регистрация Resend, получение API ключа | Пользователь |
| Сохранить ключи в Supabase secrets | Claude (с твоего ключа) |
| Создать тестовый Sender Domain `demo.clientcase.app` через Resend API | Claude |
| Получить от Resend нужные DNS-записи (MX + DKIM + SPF + Return-Path) | Claude |
| Добавить DNS-записи в Cloudflare/Hostinger | Пользователь (или Claude через CF API если будет токен) |
| Дождаться верификации в Resend | Claude (опрос) |

### Phase 1 — БД (½ дня) — Claude автономно

- [ ] not done — Применить миграцию `20260506_email_hybrid_setup.sql` (адаптация: убрать `postmark_*` колонки, добавить `resend_*`).
- [ ] not done — Применить RPC `resolve_inbound_email_address`, `match_inbound_email`, `get_thread_email_address`.
- [ ] not done — Расширить триггер `notify_telegram_on_new_message`.
- [ ] not done — Регенерация TS-типов БД.

### Phase 2 — Provision: type='email' (1 день) — Claude автономно

- [ ] not done — Расширить `/opt/clientcase-provision/provision.sh` командой `email-setup <slug>`:
  - Через Resend API создать Sender Domain.
  - Получить DNS-записи.
  - Если есть Cloudflare API token — добавить автоматически.
  - Иначе — вернуть DNS-записи как pending для ручного добавления.
- [ ] not done — Edge Function `provision-domain` ветка `email`.
- [ ] not done — UI «Активировать email» в `settings/email`.

### Phase 3 — Resend inbound webhook (1.5 дня) — Claude автономно

- [ ] not done — `src/app/api/resend-webhook/route.ts`:
  - Verify подписи через `resend.webhooks.verify()`.
  - При получении метаданных вызвать Resend API `GET /emails/{id}` для получения полного body + headers.
  - Резолв через `resolve_inbound_email_address`.
  - Маршрутизация по типам (thread/project/virtual/inbox).
- [ ] not done — Helper `extractOriginalFrom` для Gmail-forward'ов.
- [ ] not done — Тест: настроить forward в личном Gmail на `inbox@demo.clientcase.app` → отправить себе письмо → проверить что попало в нераспознанные (т.к. треда с такой перепиской ещё нет).

**Чекпоинт пользователя:** проверить в браузере что письмо появилось в `email_inbound_unmatched`.

### Phase 4 — Подключение ящиков (2 дня) — Claude автономно

- [ ] not done — Расширить таблицу `email_accounts`:
  - `auth_type`, `smtp_*`, `imap_*`, `display_name`, `forward_setup_status`, etc.
- [ ] not done — Edge Function `connect-email-account` (Gmail OAuth + SMTP).
- [ ] not done — Refactor `gmail-send` → shared `_shared/sendViaGmail.ts`.
- [ ] not done — `_shared/sendViaSmtp.ts` через `npm:nodemailer`.
- [ ] not done — UI: страница «Мои ящики» в `/profile`.
- [ ] not done — Шифрование SMTP-паролей через pgsodium.

### Phase 5 — Auto-setup forward для Gmail OAuth (1 день) — Claude автономно

- [ ] not done — При подключении Gmail OAuth добавить forward через Gmail API.
- [ ] not done — Перехват confirmation code в `resend-webhook` → парсинг кода → confirmation через Gmail API.
- [ ] not done — Status: `pending_verification` → `verified`.

**Чекпоинт пользователя:** подключить свой Gmail к demo-воркспейсу, убедиться что forward подтвердился без ручных действий.

### Phase 6 — email-internal-send (1 день) — Claude автономно

- [ ] not done — Edge Function с двумя методами:
  - `employee_mailbox`: через Gmail OAuth (через `sendViaGmail`) или SMTP (через `sendViaSmtp`).
  - `system_postmark`: через Resend API с From `t+<short>@<slug>.clientcase.app`.
- [ ] not done — Поддержка attachments (Resend API: загрузка через base64 или URL).
- [ ] not done — Reply-threading через `In-Reply-To` / `References`.
- [ ] not done — Frontend invoke в `messengerService` для writing email-сообщений.

### Phase 7 — Bounce webhook (½ дня) — Claude автономно

- [ ] not done — Resend bounce/complaint events → обновляют `email_delivery_status`.
- [ ] not done — UI индикатор (как у Wazzup).

### Phase 8 — UI (2-3 дня) — Claude + Пользователь для верификации

- [ ] not done — Композер для email-тредов:
  - Поле «Тема» для первого письма.
  - Toggle «От: `ivan@petrov-firma.com` / `t+15@<slug>.clientcase.app`».
- [ ] not done — Индикатор email-канала в шапке треда.
- [ ] not done — Раздел «Нераспознанные письма» (`/workspaces/[id]/inbox/unmatched`).
- [ ] not done — Виртуальные адреса CRUD (опциональная фича).
- [ ] not done — Вкладка «Email» в `IntegrationsTab` воркспейса.

**Чекпоинты пользователя:**

1. Проверить что отправка через подключённый Gmail работает (письмо приходит, From правильный).
2. Проверить что отправка через `t+15@<slug>` работает (Resend, From с поддомена).
3. Проверить что ответ клиента попадает в правильный тред.

### Phase 9 — Активация на rs (после demo) — совместно

- [ ] not done — Активировать email для воркспейса `rs.clientcase.app`.
- [ ] not done — Подключить свой Gmail к воркспейсу `rs`.
- [ ] not done — Real-world тест: отправить письмо реальному клиенту, дождаться ответа.

### Phase 10 — Документация (½ дня) — Claude автономно

- [ ] not done — Обновить `infrastructure.md` — раздел про email.
- [ ] not done — Закрыть `2026-05-04-email-postmark-internal-addresses.md` как «реализовано через Resend».

---

## 4. Изменения в плане v3 — конкретно для Resend

### 4.1 Webhook payload (Phase 3)

**Postmark (было в v3):** RawEmail (base64) приходит сразу в webhook → парсим mailparser → готово.

**Resend (теперь):**

```ts
// Webhook payload (метаданные)
{
  type: 'email.received',
  data: {
    id: 'email_xxxxx',
    from: 'sender@example.com',
    to: ['inbox@demo.clientcase.app'],
    subject: 'Re: Your case',
    message_id: '<abc@example.com>',
    received_at: '2026-05-09T10:00:00Z',
    attachments: [
      { id: 'att_xxx', filename: 'doc.pdf', content_type: 'application/pdf' }
    ]
  }
}

// После приёма webhook'а — отдельный API call за полным письмом
const fullEmail = await fetch(`https://api.resend.com/emails/${data.id}/inbound`, {
  headers: { Authorization: `Bearer ${RESEND_API_KEY}` }
})
// fullEmail возвращает body (HTML + text), все headers (включая In-Reply-To, References),
// raw MIME (если попросим)
```

### 4.2 Sender Domain через API (Phase 2)

```ts
// Создать домен
POST https://api.resend.com/domains
Authorization: Bearer ${RESEND_API_KEY}
Body: { name: 'demo.clientcase.app', region: 'eu-west-1' }

// Response: { id, name, status: 'pending', records: [{ type, name, value }, ...] }
// Эти records — нужно добавить в DNS (MX, DKIM, SPF, Return-Path).
```

### 4.3 Outbound API (Phase 6)

```ts
// Через Resend
POST https://api.resend.com/emails
Authorization: Bearer ${RESEND_API_KEY}
{
  from: '"Иван Иванов" <t+15@demo.clientcase.app>',
  to: ['client@example.com'],
  subject: 'Re: Your case',
  html: '<p>Ответ</p>',
  text: 'Ответ',
  headers: {
    'Message-ID': '<our-id@demo.clientcase.app>',
    'In-Reply-To': '<their-id@example.com>',
    'References': '<their-id@example.com>'
  },
  attachments: [
    { filename: 'doc.pdf', content: '<base64>' }
  ]
}
```

### 4.4 Что переименовать в БД миграции

```sql
-- Было (v3):
email_postmark_id text
postmark_domain_id text
postmark_inbox_verified boolean

-- Станет:
email_resend_id text
resend_domain_id text
resend_dkim_verified boolean
resend_mx_verified boolean
```

Имя файла миграции: `20260509_email_resend_setup.sql` (вместо `20260506_email_hybrid_setup.sql`).

---

## 5. Что Claude делает автономно vs нужно подключение пользователя

### Полностью автономно (без пользователя)

- **Phase 1:** БД миграция, RPC, типы.
- **Phase 2:** код provision-сервиса + Edge Function (но активация конкретного домена требует DNS-добавления).
- **Phase 3:** webhook (но финальный тест требует пользователя — настроить forward в личном Gmail).
- **Phase 4:** код подключения ящиков + UI.
- **Phase 5:** код auto-forward.
- **Phase 6:** код send.
- **Phase 7:** bounce webhook.
- **Phase 10:** документация.

### Нужен пользователь

| Этап | Что нужно от пользователя |
|------|---------------------------|
| Phase 0 | Регистрация Resend, передача API ключа |
| Phase 0 | Если без CF API: ручное добавление 4 DNS-записей |
| Phase 3 (тест) | Настроить forward в личном Gmail на `inbox@demo.clientcase.app` |
| Phase 5 (тест) | Подключить свой Gmail к воркспейсу demo через UI |
| Phase 8 (UI checkpoints) | Проверить в браузере что отправка/приём работают |
| Phase 9 | Активировать email на rs, real-world тест с клиентом |

---

## 6. Метрики успеха Phase 0-3 (минимально жизнеспособная версия)

После Phase 3 должно работать:

✅ На `demo.clientcase.app` создан Resend Sender Domain, DNS-верификация прошла.
✅ Письмо на `inbox@demo.clientcase.app` принимается Resend → webhook нашему API → попадает в `email_inbound_unmatched` (т.к. треда нет).
✅ Письмо на `t+1@demo.clientcase.app` (если в demo есть тред с `short_id=1`) — попадает прямо в этот тред как `project_messages source=email_internal`.
✅ Письмо на `support@demo.clientcase.app` (если создан виртуальный адрес) — применяется правило.

После Phase 6:

✅ Из ClientCase на demo можно отправить письмо клиенту — через подключённый Gmail или через Resend.
✅ Ответ клиента попадает обратно в тред автоматически.

---

## 7. Roll-back план

Если что-то пойдёт не так на любой фазе:

- **БД:** миграция через `down` (drop columns/tables). Данных не теряем — поля nullable.
- **Edge Functions:** `supabase functions delete <name>`.
- **DNS-записи Resend:** удалить из Cloudflare/Hostinger — Resend перестанет принимать.
- **Триггер БД:** восстановить предыдущую версию (есть в migrations history).
- **UI:** feature flag — `workspaces.email_active` пока `false`, вкладки и композер по-старому.

**Прод не пострадает:** всё на `demo` поддомене изолировано. На `rs` активируем только после проверки.

---

## 8. Open questions (остались на обсуждение)

### DNS-провайдер для clientcase.app — Hostinger или Cloudflare?

- Cloudflare даёт API → авто-провижининг доменов. Hostinger — пока только ручное.
- Если есть желание автоматизировать — переехать на Cloudflare DNS (бесплатно, 30 минут работы).

### Что с домен-репутацией на старте?

- Resend Sender Domain даёт Resend-managed репутацию. Не нужно греть свой IP.
- Но `From: t+15@demo.clientcase.app` будет восприниматься как «новый домен» получателями. Первое время может попадать в спам. Это окупится после ~50-100 писем.

### «Marketing emails» план Resend — игнорируем?

- Да. Нам нужны только Transactional. Marketing — это отдельная функция Resend для рассылок, у нас её нет в use case.

---

## 9. Готовность к старту

✅ Архитектура зафиксирована (план v3 + этот execution-план).
✅ Provider — Resend (выбран, исследован).
✅ Test-воркспейс — `demo`.
✅ Phase breakdown с разделением ролей.

**Старт с Phase 0** — нужны только три значения от пользователя (API ключ Resend, webhook secret, опционально CF token).
