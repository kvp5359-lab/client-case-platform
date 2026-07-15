# Лид-боты: рекламный бот-приёмник холодных лидов в личке Telegram

**Дата:** 2026-07-13
**Тип:** feat (мессенджер: приём/отправка/реакции + БД + фронт; карантинная зона)
**Статус:** БД — в проде; edge (`telegram-webhook-v2`, `telegram-send-message`, `telegram-set-reaction`) — задеплоены; фронт — push в main → CI/CD

---

Новый тип интеграции: обычный бот из @BotFather, которого рекламируют. Клиент
пишет ему в личку по ссылке из объявления — в CRM появляется личный диалог с
меткой кампании, дальше переписку ведёт назначенная команда прямо из системы.
Ботов можно завести несколько (под направление/объявление).

До этого `handlePrivateMessage` в `telegram-webhook-v2` был **пуст** — обычный бот
в личке молчал на незнакомцев (обрабатывалась только привязка `/start <uuid>`).

Полная запись расследования и продуктовых решений — в
[`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md) (журнал, раздел
«2026-07-13 (5)»). План — [`docs/feature-backlog/2026-07-13-telegram-lead-bots.md`](../feature-backlog/2026-07-13-telegram-lead-bots.md).

## Архитектура: максимум переиспользования, минимум нового

Ключевое решение — **не заводить новый канал**, а переиспользовать существующие
механизмы:

- **Тип** `telegram_lead_bot` — просто значение в `workspace_integrations.type`
  (там `text`, ALTER не нужен). `findSecretaryInGroup` фильтрует по
  `telegram_workspace_bot` → лид-бот в групповой self-heal не попадает.
- **Связь диалог↔клиент↔бот — существующая `project_telegram_chats`**
  (`telegram_chat_id` = id клиента в личке, `integration_id` = лид-бот,
  `project_id = NULL` уже разрешён). ОДНА строка обслуживает и приём (поиск
  существующего треда), и отправку: dispatch-ветка telegram резолвит чат по
  `thread_id`, а бота — по `integration_id`. **Ни новой ветки в
  `dispatch_message_to_channels`, ни новой send-функции.**
- **`source` входящих = `'telegram'`** — намеренно: он уже в skip-list триггера
  отправки и покрыт content-dedup индексом. «Канал лид» = факт привязки к
  лид-боту, а не отдельный source. Триггер и индексы не тронуты.
- **Личный диалог, `route_incoming` не дёргаем** — сделка-проект это отдельный
  второй шаг, здесь только приём холодного лида.

## Приём

- Миграция `20260713150000` — одна колонка `project_threads.lead_source jsonb`
  (`{bot_integration_id, campaign, start_payload}`), аддитивно.
- `telegram-webhook-v2/lead.ts` (новый) — `handleLeadMessage`: найти/создать
  тред + контакт + привязку, пул ответственных → `project_thread_members`,
  приветствие на первый контакт, метка кампании из `?start=` deep-link, запись
  через общий `syncTelegramIncomingMessage`, вложения.
- `sync.ts`: `mode==='lead' && private` перехватывает всю личку (включая
  `/start`) ДО команд.
- `_shared/createDirectThread.ts` (новый) — общее создание личного треда
  (контакт + channel_defaults + INSERT).

## Отправка и реакции: гейт лид-DM

У сотрудника нет личного диалога с этим клиентом — значит отвечать может только
сам лид-бот:

- `telegram-send-message`: для чата, привязанного к `telegram_lead_bot`,
  пропускается `findEmployeeBot` (иначе доставка упала бы). Префикс «Имя:» —
  по настройке бота `config.show_sender_name` (несколько сотрудников на одном
  боте → можно показывать, кто пишет; по умолчанию выключено).
- `telegram-set-reaction`: реакции из ЛК не доходили клиенту (приём работал).
  **Замер:** карта `telegram_bot_msg_ids` лид-входящих = `{"secretary": N}`
  (приём с `asPersonalBot=null`), а функция резолвила личного бота реагирующего →
  ключа его бота в карте нет → `skip: no_own_message_id`. Фикс: реакцию ставит
  сам лид-бот с ключом `'secretary'`, минуя личного бота сотрудника.
- Общий `_shared/leadChat.ts` — `getLeadChatInfo(service, integrationId)`, чтобы
  определение лид-чата не дублировалось в двух функциях.

## Гонка и краевые случаи

- **Гонка создания диалога** (Start + сразу сообщение → два треда и два
  приветствия): partial unique
  `uq_project_telegram_chats_chat_integration_active (telegram_chat_id, integration_id) WHERE is_active`
  (миграция `20260713160000`) + обработка 23505 в `lead.ts` — проигравший удаляет
  свой пустой тред и подхватывает диалог победителя; welcome и участники только
  у победителя.
- **Удалённый тред**: если тред привязки в корзине — привязка деактивируется и
  заводится новый диалог (не пишем в удалённый).
- **Fix reply-lookup при `project_id = NULL`** (`_shared/syncTelegramIncomingMessage.ts`):
  `.eq("project_id", null)` в PostgREST не матчит NULL → ветвление на `.is`.
  Чинит заодно и Business-fallback.
- **username-инъекция**: перед `.or(...neq.${username})` формат валидируется
  (`[A-Za-z0-9_]{1,32}`) — унаследованный из Business паттерн теперь гейтнут.

## Фронт

Раздел «Лид-боты» в интеграциях: список ботов, регистрация вебхука через
`BotTokenDialog`, пул ответственных, приветствие, метка кампании, показ имени
отправителя.

## Проверки

- edge `deno check` — 0 новых ошибок (webhook-v2: 2 pre-existing в upload-slot;
  telegram-send: 32 = baseline strict-null шум supabase-js), lockfile не тронут.
- фронт: tsc 0, eslint 0, тесты зелёные.
- Смок за владельцем: `t.me/<bot>?start=promo1` → Start → приветствие + диалог с
  меткой → ответ из ЛК доходит клиенту → реакция появляется в Telegram.
  Групповые/Business/MTProto не задеты.

## Затронутые файлы

Миграции `20260713150000_telegram_lead_bots.sql`,
`20260713160000_telegram_lead_chat_unique.sql`;
edge `_shared/{createDirectThread,leadChat,syncTelegramIncomingMessage}.ts`,
`telegram-webhook-v2/{lead,sync,index,types}.ts`,
`telegram-send-message/index.ts`, `telegram-set-reaction/index.ts`;
фронт `IntegrationsTab/{LeadBotsSection,types,BotTokenDialog}.tsx`,
`IntegrationsTab.tsx`; доки `channels.md`, `messenger-ledger.md`.
