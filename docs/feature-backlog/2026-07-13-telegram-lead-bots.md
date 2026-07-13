# Telegram лид-боты — приёмник холодных лидов через рекламного бота

**Дата:** 2026-07-13
**Статус:** реализация (backend+frontend в рабочем дереве, деплой/миграция/смок — за владельцем)

## Задача

Обычный Telegram-бот (`@BotFather`-токен), которого рекламируют. Клиент нажимает бота из
рекламы → пишет ему в личку → в CRM создаётся **личный диалог** (`project_id = NULL`) с
меткой кампании → команда ведёт переписку из ЛК как с любым личным диалогом.

Сейчас `telegram-webhook-v2/sync.ts` → `handlePrivateMessage` **пустой** — обычный бот
в личке молчит на сообщения незнакомцев (только `/start <uuid>` привязки).

## Продуктовые решения (зафиксированы с владельцем)

- **Несколько лид-ботов** в одном воркспейсе — да (архитектура интеграций это уже держит).
- **Пул ответственных** на бота, **«все видят всё»** — все назначенные видят входящие лиды
  и могут отвечать. Реализуется через `project_thread_members` (доступ к личному треду).
- **Метка кампании** — гибко: базовая метка на бота (`config.base_campaign`) + опциональная
  детализация из deep-link `t.me/bot?start=<payload>`. Хранится на треде в `lead_source jsonb`.
- **Приветствие** — одно на бота (`config.welcome_message`).
- **Название диалога** — по имени клиента из Telegram (потом переименовать вручную).
- **Сделка-проект** («лид → сделка → окупаемость») — ОТДЕЛЬНЫЙ второй шаг, не в этой задаче.
  Здесь только приём холодного лида в личный диалог.
- **Отдельный раздел** в интеграциях (по образцу «Ботов сотрудников»).

## Архитектурное решение (максимум переиспользования)

Ядро всех Telegram-каналов уже общее в `_shared/`. Лид-бот добавляется малым кодом:

| Слой | Переиспользуем как есть | Дописываем |
|------|-------------------------|-----------|
| Приём | `syncTelegramIncomingMessage` (вставка+дедуп), `find_or_create_contact_participant`, аватары, правки, реакции, резолв бота по интеграции (index.ts) | наполнить `handlePrivateMessage` для `mode='lead'`; `/start` payload → метка+приветствие; создание личного треда |
| Отправка | вся `telegram-send-message` (шлёт по `telegram_chat_id`, резолвит бота через `project_telegram_chats.integration_id`), статусы, форматирование | гейт лид-DM: не форсить личного бота сотрудника, не добавлять префикс «Имя:» |
| Схема | `project_telegram_chats` (связь клиент↔бот↔тред, `project_id` уже nullable), тип интеграции = `text` (без ALTER) | 1 колонка `project_threads.lead_source jsonb` |
| UI | `BotTokenDialog`, `telegram-register-webhook` (ставит v2) | раздел «Лид-боты» + config (ответственные/приветствие/метка) |

**Связь через `project_telegram_chats`** (Вариант B): одна строка `(thread_id, telegram_chat_id=id клиента,
integration_id=лид-бот, is_active)` обслуживает И приём (поиск существующего треда), И отправку
(dispatch telegram-ветка резолвит чат по `thread_id`, `resolveBotToken` — бота по `integration_id`).
Никакой новой ветки в триггере `dispatch_message_to_channels` и новой send-функции.

**source входящих = `'telegram'`** — намеренно: он уже в skip-list триггера отправки и покрыт
content-dedup индексом (`WHERE source='telegram'`). «Канал лид» определяется фактом привязки
треда к лид-боту, а не отдельным source. Не трогаем триггер/индексы.

**Общий `_shared/ensureDirectThread.ts`** — обобщённое создание личного треда (`project_id=null`),
параметризуется ключевыми колонками. Лид использует его сразу. `ensureBusinessThread` /
`ensureMTProtoThread` — кандидаты на перевод отдельным заходом со смоком (не трогаем чужой
карантин в этой сессии; долг зафиксирован).

## Что дописываем — по файлам

### Миграция (файл, НЕ применять в прод без «да»)
- `project_threads.lead_source jsonb` nullable — `{bot_integration_id, campaign, start_payload}`.

### Edge (карантин)
1. `_shared/ensureDirectThread.ts` (новый) — общий ensure личного треда.
2. `_shared/syncTelegramIncomingMessage.ts` — **fix reply-lookup при `project_id=null`**
   (`.eq("project_id", null)` не матчит → ветвление `.is`). Чинит и Business-fallback.
3. `telegram-webhook-v2/types.ts` — `IntegrationContext.mode: '...' | 'lead'`.
4. `telegram-webhook-v2/index.ts` — принять `type='telegram_lead_bot'` → `mode='lead'`.
5. `telegram-webhook-v2/lead.ts` (новый) — `handleLeadMessage`: найти/создать тред+контакт+binding,
   добавить ответственных в `project_thread_members`, записать сообщение, приветствие на `/start`,
   метка из payload/config.
6. `telegram-webhook-v2/sync.ts` — `handlePrivateMessage(msg, ctx)`; для `mode='lead'` в личке
   всё (вкл. `/start`) → `handleLeadMessage`.
7. `telegram-send-message/index.ts` — гейт лид-DM (skip employee-бот + skip префикс «Имя:»).

### Фронт
8. `IntegrationsTab/types.ts` — `telegram_lead_bot` в union + поля config (responsible_user_ids,
   welcome_message, base_campaign).
9. `IntegrationsTab/BotTokenDialog.tsx` — регистрировать webhook и для `telegram_lead_bot`.
10. `IntegrationsTab/LeadBotsSection.tsx` (новый) — список + добавить + настройки бота.
11. `IntegrationsTab.tsx` — вкладка/секция «Лид-боты».

## Грабли (карантин)
- **Приоритет личного бота сотрудника** (`findEmployeeBot` первым в send) — для лид-DM пропустить,
  иначе ответ уйдёт личным ботом сотрудника (у него нет диалога с клиентом → доставка упадёт).
- **Префикс «Имя:»** — для лид-DM убрать (клиенту не нужен).
- **reply в `project_id=null`** — подломлен в `_shared` (существующий баг Business) → чиним.
- **Групповой self-heal** (`findSecretaryInGroup`) в личке не должен включаться — happy-path (живой
  integration_id) его не касается; при протухании интеграции — не наш кейс (гейтим при необходимости).
- **Гонка первого сообщения** — тред создаётся select→insert (как Business), partial-unique не
  добавляем; двойное сообщение в одну секунду теоретически даст два треда (крайне редко).

## Деплой (строго со смоком, за владельцем)
1. Миграция `project_threads.lead_source`.
2. Edge `--no-verify-jwt`: `telegram-webhook-v2` (приём), `telegram-send-message` (отправка).
   Общий `_shared` тянут обе — редеплой обеих.
3. Фронт — CI blue/green.
4. Регистрация бота: раздел «Лид-боты» → вставить токен (BotFather: `/setprivacy`→Enable не
   обязателен для лички) → webhook ставится автоматически.
5. **Смок:** по рекламной ссылке `t.me/<bot>?start=promo1` жмём Start → приходит приветствие +
   в CRM появляется личный диалог с меткой `promo1` → отвечаем из ЛК → доходит клиенту → клиент
   пишет ещё → падает в тот же диалог. Проверить, что групповые боты/Business/MTProto не задеты.
