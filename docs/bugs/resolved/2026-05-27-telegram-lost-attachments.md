---
id: 2026-05-27-telegram-lost-attachments
title: Файлы из Telegram пропадают тихо — webhook не делал retry и не помечал сбой
status: resolved
severity: high
area: telegram-webhook, media, ui
first-seen: 2026-02-26 (по самой ранней находке в БД)
last-investigated: 2026-05-27
partial-fix-deployed: 2026-05-27 (v2 only)
resolved: 2026-05-28 (унификация v1+v2 распространила фикс на employee-боты)
reproduced: yes (исторические данные)
---

## Что было

Webhook `telegram-webhook-v2` записывает `project_messages` сразу при приёме TG-update'а, потом отдельно идёт качать файл через `getFile` Bot API. `downloadAttachments` в [media.ts](../../supabase/functions/telegram-webhook-v2/media.ts) **молча проглатывала ошибки** (`if (!dl) continue;`), не возвращала статус, не делала retry. Любая ошибка скачивания (429 rate-limit при `media_group`, временный сетевой сбой, истёкший `file_path`) приводила к тихой потере файла. У сообщения оставался только `content='📎'` (или caption-текст), без `message_attachments`. Пользователь в UI видел текст без файла — и не знал, что файл должен был быть.

За 3 месяца (фев-май 2026) в одном воркспейсе накопилось **минимум 18 явных потерь** (медиа без caption). Реальный объём больше — невозможно отделить потерянные документы с caption от обычных текстовых сообщений без сверки с Telegram вручную.

Парные потери с интервалом 1 сек в логах указывали на ключевой источник — **media_group**: Telegram присылает 2-3 файла параллельными update'ами, второй-третий getFile получает 429, файл теряется.

## Что сделано 2026-05-27 (частичный фикс, без MTProto recovery)

### 1. Миграция `20260527_telegram_attachment_status.sql`
- Колонки `project_messages.attachment_status` (`'pending' | 'failed' | NULL`) и `attachment_error jsonb`.
- Backfill: помечены 19 исторических осиротевших сообщений (`content='📎'` + без attachments) как `attachment_status='failed'` с пометкой `stage='backfill'`. Пользователь увидит их в истории как «файл не загружен» вместо тихой пустоты.

### 2. Переписан `telegram-webhook-v2/media.ts`
- `fetchTelegramFile` — до 3 попыток с exponential backoff (400/800/1600 мс) при 429, 5xx, сетевых ошибках. 4xx (кроме 429) — не ретраит (нет смысла).
- Возвращает структурированный результат `{ ok, buffer, path } | { ok: false, reason, httpStatus, attempts }`.
- `downloadAttachments` помечает сообщение `pending` перед загрузкой, после загрузки выставляет `failed` + детали (имена файлов, причины, кол-во попыток) если есть сбои, или `NULL` если всё успешно.

### 3. UI плашка в `MessageBubble.tsx`
- `attachment_status='failed'` → красная плашка «⚠️ Файл из Telegram не загружен» с именами файлов и причинами.
- `attachment_status='pending'` → тонкая надпись «Загружаю файл из Telegram…».
- Берётся из `project_messages.*` через существующий `MESSAGE_SELECT`, дополнительных запросов нет.

### 4. Подправлен `upload-slot.ts`
- Два места с `if (!dl)` адаптированы под новый return type `fetchTelegramFile` (`if (!dl.ok)`).

### 5. Деплой `telegram-webhook-v2` с `--no-verify-jwt` 2026-05-27.

## Зона поражения

Все TG-каналы (group, business, mtproto) — все используют `_shared/syncTelegramIncomingMessage.ts`, который вызывает `downloadAttachments` через webhook.

## Что НЕ сделано (отложено)

- **MTProto recovery** для уже потерянных файлов. Пользователь явно отказался: «достаточно знать что файл был и не доставлен, я сам схожу в TG». 19 исторических остаются с пометкой `failed` без возможности восстановления через UI.
- **Сериализация media_group** (обрабатывать пакет последовательно). Сейчас webhook обрабатывает каждый update параллельно. Retry в `fetchTelegramFile` должен покрыть 90%+ случаев media_group — если 3 попытки с задержкой не помогают, проблема сильно глубже.
- **Failed_attachments cron** для автоматического повторного скачивания через MTProto. Не делается — см. выше.
- **Slack/Email alert** на массовые сбои. UI-плашка достаточна на текущем объёме.
- **Аналогичный фикс в `wazzup-webhook`** — там тоже `downloadAndAttach` без проверки результата ([wazzup-webhook/index.ts:312-324](../../supabase/functions/wazzup-webhook/index.ts:312)). Если в Wazzup проявится тот же баг — повторить тот же паттерн (retry + status).

## Как воспроизвести / как тестировать

1. Отправить из своего TG в любую группу с ботом несколько файлов одним пакетом (media_group, 3-4 шт).
2. В обычном случае все файлы должны загрузиться (retry покрывает 429).
3. Для проверки failure-кейса — временно выключить интернет на момент webhook или подделать `getFile` чтобы возвращал 429. Сообщение должно появиться с красной плашкой в треде.
4. В БД: `SELECT id, content, attachment_status, attachment_error FROM project_messages WHERE attachment_status IS NOT NULL ORDER BY created_at DESC LIMIT 10;`

## Resolved 2026-05-28

Унификация webhook v1+v2 (см. [docs/changelog/2026-05-28-telegram-webhook-unified.md](../../changelog/2026-05-28-telegram-webhook-unified.md)) перенесла все 4 ботов (rs1_support, rs_help102, rs_help123, sppropia103) на v2 webhook вместе с переключением `bot_version='v2'` для всех 85 чатов. Retry на скачивание автоматически применился к employee-ботам — потери файлов 9.5% у employee должны опуститься до уровня workspace (0.9%).

Сопутствующая регрессия: при унификации обнаружился баг в `v2/sync.ts` — `downloadAttachments` вызывался при любом непустом `sync.rowId`, включая `outcome='enriched'`. Это давало повторный upload в Storage от второго бота → 23505 «resource already exists» → ложная плашка `attachment_status='failed'` поверх успешной загрузки. Фикс — копия защиты из v1: `sync.outcome === "inserted" && sync.rowId`. Закоммичен `0e4e6c2`, задокументирован в [gotchas.md → downloadAttachments только при outcome='inserted'](../../../.claude/rules/gotchas.md#downloadattachments-только-при-outcomeinserted).

## Связано

- Миграция [20260527_telegram_attachment_status.sql](../../../supabase/migrations/20260527_telegram_attachment_status.sql)
- Память [feedback_no_test_insert_into_project_messages.md](../../../.claude/projects/-Users-kvp5359---------client-case-platform/memory/feedback_no_test_insert_into_project_messages.md) — урок инцидента того же дня
- Унификация webhook'ов: [docs/changelog/2026-05-28-telegram-webhook-unified.md](../../changelog/2026-05-28-telegram-webhook-unified.md)
