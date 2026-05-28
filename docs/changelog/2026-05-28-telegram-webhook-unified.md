# Telegram-webhook v1+v2 → единая Edge Function

**Дата:** 2026-05-28
**Тип:** refactoring + bugfix + миграция данных
**Статус:** completed (фаза А, big bang)
**Карантинная зона:** мессенджер — 85 живых клиентских чатов

---

## Контекст

До 2026-05-28 параллельно жили две Edge Functions:
- `telegram-webhook` (v1, монолит ~770 строк) — обслуживал 68 чатов через 2 workspace-бота + 3 employee-бота.
- `telegram-webhook-v2` (распиленный, 14+ модулей) — обслуживал 17 чатов одного workspace-бота `rs2_support_bot`.

Проблема 1 — **рассинхрон фикса retry**. В рамках бага [2026-05-27-telegram-lost-attachments](../bugs/resolved/2026-05-27-telegram-lost-attachments.md) retry на скачивание файлов был добавлен только в `v2/media.ts`. У employee-ботов потери файлов оставались ~9.5% против 0.9% у workspace-бота. И так было бы при каждой следующей правке мессенджера.

Проблема 2 — **80% дублирующего кода** между v1 и v2 (приём, dedup, реакции, edit, медиа). Расходились только команды/inline/upload-slot/sessions для workspace-бота.

Цель — единая точка для обоих типов ботов с разделением функциональности через `IntegrationContext.mode`.

---

## Открытие, изменившее план

Backlog предполагал поэтапную миграцию **по integration_id employee-ботов**. На самом деле в `project_telegram_chats`:
- 57 чатов v1 принадлежали `rs1_support_bot` (workspace)
- 6 чатов v1 — `rs2_support_bot` v1 (workspace, legacy)
- 5 чатов v1 — без `integration_id` (совсем legacy)
- 17 чатов v2 — `rs2_support_bot` v2

**Employee-боты НЕ имели своих записей в project_telegram_chats.** Они сидят в группах workspace-ботов как «гости», multi-bot dedup в БД отсеивает их через UNIQUE-индекс по `(chat_id, sender_user_id, date, file_unique_id)`. Архитектурно бот = один webhook URL для всех его групп, поэтому поэтапная миграция «по чату» невозможна.

Выбрана стратегия **big bang** (вариант A) вместо вариантов B/C из обсуждения:
- A — Все боты одновременно на v2 + UPDATE всех чатов. Высокий риск, быстрая развязка.
- B — Только workspace, employee остаются на v1. Безопасно, но не закрывает retry-фикс у employee.
- C — Снять фильтр `bot_version` в `v2/bindings.ts`. Архитектурно правильно, но без миграции данных.

Big bang выбран, потому что пользователь был доступен для активного смок-теста.

---

## Что сделано

### 1. Фаза 1 — код v2 (commit `45135ff`)

Шесть точечных правок в `supabase/functions/telegram-webhook-v2/`:

- **`types.ts`** — `TgMessage.migrate_to_chat_id`/`migrate_from_chat_id`, новый интерфейс `IntegrationContext { id, workspaceId, botId, mode }`.
- **`index.ts`** — entry-функция принимает оба типа (`telegram_workspace_bot` + `telegram_employee_bot`). Собирает `ctx` из `workspace_integrations.config.bot_id`, прокидывает в `handleMessage`/`handleCallback`.
- **`sync.ts`** — `handleMessage(msg, isEdited, ctx)`. `asPersonalBot` из `buildPersonalBotContext(ctx)`: workspace → `null`, employee → `{ integrationId, workspaceId, botId }`. Сессии awaiting_file и MENU-reply-кнопка — только workspace mode. Обработка `migrate_to_chat_id`: UPDATE `project_telegram_chats.telegram_chat_id` со старого на новый.
- **`pure.ts`** — ветка `migrate_to_chat_id` в `getServiceMessageText` («Группа была преобразована в супергруппу»).
- **`commands.ts`** — `handleCommand(msg, text, ctx)`. В employee-mode разрешены только `/start`, `/help`, `/link`, `/unlink`. Остальные молчат.
- **`callbacks.ts`** — `handleCallback(cb, ctx)`. В employee-mode тихий `answerCallback` и выход.

Деплой `telegram-webhook-v2` сразу — безопасно, т.к. до фазы 2 Telegram продолжает слать employee-апдейты на v1 URL.

### 2. Фаза 2 — миграция данных + setWebhook

**Бэкап:** `_backup_project_telegram_chats_20260528` (86 строк).

**SQL-миграция (всё одной транзакцией):**
```sql
UPDATE project_telegram_chats
SET bot_version = 'v2'
WHERE is_active = true AND bot_version = 'v1';
-- 68 строк
```

**setWebhook на v2 URL** для 4 ботов (rs2_support_bot уже был на v2):
- `rs1_support_bot` (workspace)
- `rs_help102_bot`, `rs_help123_bot`, `sppropia103_bot` (employee)

Все 4 с `allowed_updates=["message","edited_message","callback_query","message_reaction","message_reaction_count"]`.

**Порядок UPDATE→setWebhook** важен: v1 webhook не фильтрует по `bot_version`, поэтому продолжает принимать апдейты в окне между шагами. v2 после `setWebhook` уже видит правильный `bot_version` в БД. Окно потери = 0.

### 3. Регрессия и фикс (commit `0e4e6c2`)

При первом смок-тесте — media_group из 3 файлов в группе с workspace + employee — обнаружено: для PDF 248 KB ложная плашка «Файл из Telegram не загружен» поверх успешно загруженной карточки.

**Корень:** `v2/sync.ts` проверял `sync.rowId ? ... : null` — это true и для `outcome='inserted'`, и для `outcome='enriched'`. Раньше не проявлялось, потому что v2 всегда был секретарём (`asPersonalBot=null`), и `enrich`-ветка в `_shared/syncTelegramIncomingMessage.ts` никогда не активировалась. После фазы 1 employee-боты приходят на v2 с непустым `asPersonalBot` → enrich возвращает rowId существующей строки → второй `downloadAttachments` пытался залить в тот же путь Storage с `upsert:false` → 23505 «resource already exists» → `media.ts` переписал `attachment_status='failed'` поверх успеха.

**Фикс:** копия защиты из v1 (`v1/index.ts:398`):
```ts
if (sync.outcome === "inserted" && sync.rowId) {
  await downloadAttachments(...);
}
```

Cleanup ложной плашки для msg `7f1be313-ae02-4bbd-8ad2-8dc499e31b64` (attachment_status сброшен в NULL).

Воспроизведение после фикса: повторно отправлена та же media_group → все 3 файла без плашек.

Записано в [gotchas.md → downloadAttachments только при outcome='inserted'](../../.claude/rules/gotchas.md#downloadattachments-только-при-outcomeinserted).

---

## Документация

- `.claude/rules/channels.md` — раздел Telegram переписан под единый webhook (таблица функционала workspace vs employee + ссылка на gotcha).
- `.claude/rules/gotchas.md` — новая ловушка про `downloadAttachments`.
- Этот changelog.
- Bug-doc 2026-05-27-telegram-lost-attachments перемещён в `docs/bugs/resolved/`.

---

## Что осталось (отложено на 1-2 недели стабильности)

- `supabase functions delete telegram-webhook` (v1) — после периода наблюдения. До тех пор v1 живой как hot-fallback (но не получает трафик, т.к. все боты на v2).
- Дропнуть колонку `project_telegram_chats.bot_version` — после унификации она не используется в коде (фильтр в `bindings.ts` остался, но все чаты теперь 'v2').
- Удалить `_backup_project_telegram_chats_20260528`.

---

## Затронутые коммиты

- `2afae9c` — fix(telegram-webhook): retry на скачивание вложений + attachment_status (подготовка)
- `45135ff` — feat(telegram-webhook-v2): принимать employee-боты + migrate_to_chat_id (фаза 1)
- `0e4e6c2` — fix(telegram-webhook-v2): downloadAttachments только при outcome='inserted' (регрессия)

---

## Связано

- [Бэкап-таблица в БД](`_backup_project_telegram_chats_20260528`) — 86 строк, удалить через 1-2 недели.
- [Bug 2026-05-27-telegram-lost-attachments](../bugs/resolved/2026-05-27-telegram-lost-attachments.md) — родительский баг про retry.
- [.claude/rules/channels.md](../../.claude/rules/channels.md) — раздел Telegram.
- [.claude/rules/gotchas.md](../../.claude/rules/gotchas.md) — multi-bot dedup и downloadAttachments outcome.
