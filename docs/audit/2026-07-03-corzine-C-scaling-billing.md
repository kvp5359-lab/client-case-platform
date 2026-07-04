# Корзина C — Оптимизация БД, биллинг, лимиты, второй инстанс (2026-07-03)

Проработка четырёх крупных инфраструктурных тем из мастер-плана. Формат: что **уже
сделано безопасно**, что **готово к применению**, и что **требует твоего решения или
смок-теста** (в прод вслепую не применял).

---

## 1. Оптимизация БД под нагрузку

### ✅ Сделано безопасно (в проде / закоммичено)
- **Индексы на 16 непокрытых FK** (C4) — применено в прод (CONCURRENTLY).
- **Пагинация сегментных inbox-RPC** (C1) — `unread/awaiting/needs_reply/muted` теперь
  тянутся постранично по 1000 (грабля G9 «молчаливая потеря хвоста >1000 тредов»).
  Ниже 1000 строк поведение идентично → закоммичено во фронт.

### ⏳ Готово по анализу, но требует смок-теста (не применял)

**Главный источник нагрузки — Realtime WAL-декодинг (~63% времени БД).** Проверил
факт: **все 7 таблиц** realtime-publication реально слушаются фронтом через Postgres
Changes, поэтому **просто убрать таблицы из publication НЕЛЬЗЯ** — сломается realtime:

| Таблица в publication | Кто слушает (Postgres Changes) | Масштаб |
|---|---|---|
| `project_messages` | `useNewMessageToast` (весь воркспейс!), `useProjectMessages` (1 тред) | 🔴 тяжёлый |
| `project_threads` | `useNewMessageToast` (весь воркспейс) | 🔴 тяжёлый |
| `message_reactions`, `message_attachments` | `useProjectMessages` (1 открытый тред) | 🟢 bounded |
| `message_send_failures` | `useSendFailures` | 🟢 |
| `project_telegram_chats` | `useTelegramLink` | 🟢 |
| `export_progress` | `googleDriveService` | 🟢 |

**Что снизит WAL-нагрузку** (в порядке эффекта): перевести **workspace-wide** подписки
`useNewMessageToast` (project_messages + project_threads) на **Broadcast** — так же, как
уже сделали для инбокса (`useWorkspaceMessagesRealtime`, ledger Фаза 3). Сейчас
`useNewMessageToast` дублирует те же события через Postgres Changes на КАЖДОГО онлайн-
пользователя → RLS-проверка на подписчика на каждое сообщение воркспейса.

**Почему не сделал сам:** `useNewMessageToast` — карантин (тосты нового сообщения,
логика подписки/видимости). Перевод на Broadcast требует смок-теста всех каналов и
проверки, что тосты приходят корректно. Делать отдельной сессией со смоком.

**Точный план (готов к исполнению):**
1. Триггер `trg_inbox_broadcast` уже шлёт события в топик `inbox:<ws>` (есть).
   Проверить, что payload содержит достаточно для тоста (thread_id, sender, project).
2. Переписать `useNewMessageToast` на подписку broadcast-канала `inbox:<ws>`
   (`private:true` + `setAuth`), убрать оба `postgres_changes` (project_messages,
   project_threads).
3. `audit_logs` в подписке `useThreadAuditEvents` — **не в publication** (проверено),
   т.е. эта подписка сейчас, вероятно, не срабатывает; разобрать отдельно.
4. Смок: новое входящее → тост приходит; @упоминание в mute → приходит; свои
   сообщения тост не плодит; во второй вкладке событие ловится.
5. После миграции ВСЕХ workspace-wide подписок на Broadcast — `project_threads` можно
   убрать из publication (останется только per-thread `useProjectMessages`).

### 🟠 Требует твоих действий (панель/тариф)
- **Апгрейд инстанса + connection pooler** (C3): сейчас `max_connections=60`, Auth
  ограничен 10 соединениями. Перед масштабированием — тариф Supabase выше + Supavisor
  (transaction mode). Только через панель.

---

## 2. Биллинг (C8)

**Статус:** нужен твой выбор провайдера и тарифов. Схема БД — стандартная, готова
черновиком (НЕ применял — структура зависит от тарифной модели).

### Решения за тобой
- **Провайдер:** ЮKassa / CloudPayments / Stripe (для РФ-юрлиц обычно ЮKassa/CloudPayments).
- **Модель:** подписка на воркспейс (за место/за воркспейс/за объём)? Пробный период?
- **Тарифы и цены.**

### Черновик схемы (применять после решений)
```sql
-- НЕ применён. Проект тарифов/подписок под воркспейс.
CREATE TABLE public.billing_plans (
  id text PRIMARY KEY,                       -- 'free' | 'team' | 'business'
  name text NOT NULL,
  price_month_rub integer NOT NULL DEFAULT 0,
  max_participants integer,                  -- NULL = без лимита
  max_projects integer,
  max_storage_mb integer,
  max_messages_month integer,
  features jsonb NOT NULL DEFAULT '{}',       -- флаги фич по тарифу
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE public.workspace_subscriptions (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  plan_id text NOT NULL REFERENCES public.billing_plans(id),
  status text NOT NULL DEFAULT 'trialing',   -- trialing|active|past_due|canceled
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  provider text,                             -- 'yookassa' | 'cloudpayments' | ...
  provider_subscription_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.billing_events (       -- аудит платежей/вебхуков провайдера
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL,                        -- payment.succeeded | subscription.canceled | ...
  provider text,
  amount_rub integer,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: чтение подписки — участникам воркспейса; запись — только service_role
-- (webhook провайдера). billing_plans — read всем authenticated.
```
Далее: Edge Function `billing-webhook` (приём событий провайдера, verify подписи),
UI тарифов, гейт по `workspace_subscriptions.status` в layout.

---

## 3. Лимиты и квоты (C2-limits)

**Статус:** механизм могу сделать сейчас с **настраиваемыми** значениями (не требует
выбора провайдера). Значения по умолчанию — мягкие, ты подкрутишь. Пока НЕ применял —
жду твоего «применяй» (это защита от того, что один жирный клиент выест ресурсы общей
БД: см. Фаза 2 — needs_reply 555 мс, WAL-нагрузка).

### Черновик (готов к применению по твоему слову)
```sql
-- Лимиты берутся из billing_plans (если биллинг есть) ИЛИ из этой таблицы-оверрайда.
CREATE TABLE public.workspace_limits (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  max_participants integer,     -- NULL = без лимита
  max_projects integer,
  max_storage_mb integer,
  max_messages_month integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Проверка при добавлении участника/проекта — в существующих RPC/Edge:
-- перед INSERT считать текущее кол-во и сравнить с лимитом, иначе понятная ошибка.
-- Storage — периодический пересчёт (cron) в workspace_usage.
CREATE TABLE public.workspace_usage (   -- материализованные счётчики потребления
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  participants_count integer NOT NULL DEFAULT 0,
  projects_count integer NOT NULL DEFAULT 0,
  storage_mb integer NOT NULL DEFAULT 0,
  messages_this_month integer NOT NULL DEFAULT 0,
  recomputed_at timestamptz NOT NULL DEFAULT now()
);
```
Гейт-мест: `set-participant-access`/создание участника (max_participants),
`useCreateProject` (max_projects), загрузка файлов (max_storage_mb),
триггер сообщений (max_messages_month, мягко — предупреждение, не блок).

**Решение за тобой:** какие лимиты жёсткие (блок), какие мягкие (предупреждение);
конкретные числа по тарифам.

---

## 4. Второй инстанс / воспроизводимость (C7)

**Проблема (Фаза 2 #7):** репо НЕ воспроизводит прод — **688 миграций применено против
308 файлов** + короткий формат имён (коллизии порядка) + ручные MCP-правки RPC.
Поднять второй инстанс/стейджинг с нуля детерминированно нельзя.

### Что могу сделать (частично начал анализ)
- Сгенерировать **squash-базлайн** — единый снимок текущей схемы прода как новую
  стартовую миграцию, поверх которой пойдут только новые. Это делает `db push` на
  чистой БД = прод.

**Почему не выполнил автономно:** корректный squash-дамп схемы (все таблицы, RLS,
функции, триггеры, гранты, publication) технически надёжнее снять через `pg_dump
--schema-only` с боевой БД (у меня из MCP — только пофункционные `pg_get_functiondef`,
собирать полный дамп по кускам ненадёжно и легко упустить объект). Это твоя команда:
```bash
supabase db dump --project-ref zjatohckcpiqmxkmfxbs -f supabase/migrations/00000000000000_squash_baseline.sql --schema public
# затем: пометить все существующие 308 файлов как «до базлайна» (перенести в archive/)
# или зафиксировать baseline и вести новые миграции ПОВЕРХ (14-значный таймстамп).
```
После этого репо воспроизводит прод, и второй инстанс/стейджинг разворачивается штатно.

### Что ещё нужно для второго инстанса (чеклист)
- Секреты (Supabase secrets, mtproto `.env`, INTERNAL_FUNCTION_SECRET, JWT_SIGNING_SECRET).
- Боты Telegram (новые токены), Wazzup-ключ, email-домены (provision).
- pg_cron джобы (7 шт) с новыми service_role-ключами.
- Deno edge-функции (deploy).
Это по своей природе ручные шаги на каждый инстанс — автоматизация = отдельный проект.

---

## Итог — что от тебя нужно, чтобы двигаться

| Тема | Решение за тобой | Могу сделать по «да» |
|---|---|---|
| WAL/Broadcast | — | Перевод `useNewMessageToast` на Broadcast (со смоком мессенджера) |
| Инстанс/pooler | Апгрейд тарифа Supabase | — |
| Биллинг | Провайдер + тарифы + цены | Применить схему + каркас webhook/UI |
| Лимиты | Числа + жёсткие/мягкие | Применить схему + гейты (готов сейчас) |
| Второй инстанс | Запустить `supabase db dump` | Оформить squash-базлайн из твоего дампа |

Скажи по каждому «применяй / решил так-то» — и я сделаю следующий шаг. Ничего из
этого в прод вслепую не применял.
