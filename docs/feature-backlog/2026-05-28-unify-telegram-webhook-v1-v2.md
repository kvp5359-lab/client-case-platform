# Унификация telegram-webhook v1 и v2 в один Edge Function

**Статус:** план готов к старту, делать в отдельной сессии (см. ниже стратегию из двух фаз).
**Карантинная зона:** **🔴 наивысшая опасность** — мессенджер обслуживает 85 живых клиентских чатов.

---

## Текущее состояние (на 2026-05-28 07:50)

### Что в БД

- **5 telegram-интеграций** в одном воркспейсе client-case:
  - `telegram_workspace_bot`: 2 шт (один из них тестовый «Тест - новый бот»)
  - `telegram_employee_bot`: 3 шт
- **85 уникальных активных чатов** в `project_telegram_chats`:
  - **68 на `bot_version='v1'`** ← legacy webhook, основная масса
  - **17 на `bot_version='v2'`** ← новые чаты тестового бота
- В одном `telegram_chat_id` ровно ОДНА запись `project_telegram_chats` (1:1). `bot_version` указывает, какой webhook обслуживает чат.

### Что в коде

- **v1 (`supabase/functions/telegram-webhook/`)** — монолит ~770 строк в `index.ts`. Обслуживает 68 чатов через employee-боты.
- **v2 (`supabase/functions/telegram-webhook-v2/`)** — распиленная архитектура, 14+ модулей. Обслуживает 17 чатов через workspace_bot. В `index.ts:71` стоит фильтр `integration.type !== "telegram_workspace_bot" → 401`, employee не пускает.
- **`_shared/syncTelegramIncomingMessage.ts`** — общий код приёма сообщений. Обновлён в правке 2026-05-27 для корректного content при стикерах/анимациях (`🟪 Стикер 😄`, `🎞 GIF`). После деплоя обоих webhook'ов применяется в обоих.
- **`_shared/syncTelegramReactions.ts`** — общая обработка реакций.

### Что уже сделано до унификации (2026-05-27, частичный фикс)

В рамках бага `docs/bugs/open/2026-05-27-telegram-lost-attachments.md`:

- **Миграция `20260527_telegram_attachment_status.sql`** — колонки `project_messages.attachment_status` (`pending` / `failed` / `NULL`) и `attachment_error jsonb`. Backfill пометил 19 исторических осиротевших сообщений как `failed`.
- **`v2/media.ts` переписан**: retry (3 попытки, exp backoff), статус `pending` перед загрузкой, `failed` со списком файлов и причинами при провале. Возвращает `{ok, failed}` из `downloadAttachments`.
- **`v1/index.ts:handleAttachments`** — частично обновлён: добавлено скачивание thumbnail для стикеров и анимаций (~20 строк). **Retry в v1 НЕ добавлен** — отложено до этой унификации, чтобы не плодить дубли.
- **UI**: в `MessageBubble.tsx` красная плашка «⚠️ Файл из Telegram не загружен» при `attachment_status='failed'`, серая «Загружаю…» при `pending`.
- **Сравнение потерь в БД** (с 1 апреля):
  - workspace_bot (v2): 2 потерянных / 1640 сообщений = **~0.9%** (после фикса)
  - employee_bot (v1): 7 потерянных / 628 сообщений = **~9.5%** ← retry отсутствует

---

## Зачем унификация

1. **Один источник правды.** Сейчас правка мессенджера требует двух мест. Инцидент 2026-05-28: я обновил retry в v2, забыл v1 → employee-боты остались с потерями файлов 10× выше. И так будет повторяться при каждой правке.
2. **80% дублей.** Оба webhook'а делают одно и то же в большинстве операций (приём, dedup, реакции, edit, медиа). Расходятся только в зоне команд/inline/upload-slot для workspace_bot. Дублировать 80% ради 20% разницы нерационально.
3. **Технический долг растёт.** v1 ~770 строк, v2 ~1500+ в распиле. Через год станет невозможно отследить расхождения.
4. **Пора закрыть дыру с потерями файлов у employee-ботов** — фикс retry применится автоматически.

---

## АРХИТЕКТУРНОЕ РЕШЕНИЕ

**v2 после унификации = текущий v2 + «облегчённый режим» для employee-ботов.**

В entry-функции v2 определяется `mode = 'workspace' | 'employee'` по типу интеграции:

```
if (integration.type === 'telegram_workspace_bot') {
  mode = 'workspace';
  // обработка команд, inline, sessions, knowledge, upload — как сейчас в v2
} else if (integration.type === 'telegram_employee_bot') {
  mode = 'employee';
  // ТОЛЬКО приём входящих + реакции + edit + dedup — БЕЗ команд/кнопок/сессий
}
```

| Функционал | workspace | employee |
|------------|-----------|----------|
| Приём текстовых сообщений | ✅ | ✅ |
| Медиа с retry (всё что в v2/media.ts) | ✅ | ✅ |
| Реакции (👍 на сообщение) | ✅ | ✅ |
| Edited messages | ✅ | ✅ |
| Service messages (group_chat_created и т.д.) | ✅ | ✅ |
| `migrate_to_chat_id` (group→supergroup, chat_id меняется) | ✅ (нужно добавить) | ✅ (нужно добавить) |
| `/menu`, `/knowledge`, `/upload`, `/status` команды | ✅ | ❌ молчит |
| Inline-кнопки (callback_query) | ✅ | ❌ молчит |
| Многошаговые сессии (`telegram_bot_sessions`) | ✅ | ❌ |
| База знаний / выдача статей | ✅ | ❌ |
| `/start`, `/link`, `/unlink` | ✅ | ✅ (нужно для пользования) |
| `asPersonalBot` контекст в `syncTelegramIncomingMessage` | NULL | `{ integrationId, workspaceId, botId }` |

---

## ДЕТАЛЬНЫЙ АУДИТ v1 vs v2 (25 пунктов)

| № | Что | v1 | v2 | Действие |
|---|-----|----|----|----------|
| 1 | Определение `integration` по header `x-telegram-bot-api-secret-token` | index.ts:209 | index.ts:59-74 | использовать v2 |
| 2 | Различие type=workspace vs employee | index.ts:233-242 | пропущено (`!= workspace_bot → 401` в index.ts:71) | **снять фильтр + ветвление** |
| 3 | Хранение employee-ботов | workspace_integrations с type=employee_bot | не учитывается | использовать существующую таблицу |
| 4 | BotId из config | `integration.config.bot_id` (index.ts:238-240) | не подгружается | **портировать для asPersonalBot** |
| 5 | findChatBinding | `project_telegram_chats` по chat_id (index.ts:279-283) | `bindings.ts:11-19` с фильтром `bot_version='v2'` | использовать v2, **но мигрировать данные** |
| 6 | asPersonalBot в `syncTelegramIncomingMessage` | передаётся `{integrationId, workspaceId, botId}` (index.ts:395) | **хардкод null** (sync.ts:132) | 🔴 **критично портировать** |
| 7 | Reply-lookup с учётом integration_id | да (syncTelegramIncomingMessage.ts:162-164) | то же | использовать общий код |
| 8 | Service messages: типы | group_chat_created, new_chat_members, left_chat_member, new_chat_title, pinned_message, **migrate_to_chat_id** (index.ts:154-189) | только первые 5, **`migrate_to_chat_id` отсутствует** | 🔴 **критично портировать** |
| 9 | Service messages: запись в БД с source=telegram_service | index.ts:292-307 | sync.ts:88-100 | использовать v2 |
| 10 | edited_message | applyTelegramEdit (index.ts:259-263, 316-323) | sync.ts:105-112 через handleMessage(true) | использовать v2 |
| 11 | message_reaction | index.ts:247-250 | index.ts:86-87 | использовать v2 |
| 12 | message_reaction_count | index.ts:251-256 | index.ts:88-91 | использовать v2 |
| 13 | /start, /link, /unlink | handleCommand v1 (index.ts:479-641) | commands.ts:19-79 | использовать v2 (нужно для обоих режимов) |
| 14 | /menu, /knowledge, /upload, /status, /requirements, /help | нет | commands.ts:40-73 | только workspace mode |
| 15 | callback_query | нет | callbacks.ts | только workspace mode |
| 16 | Медиа: photo, document, voice, audio, video, video_note, sticker.thumbnail, animation.thumbnail | index.ts:644-708 | collectFiles в pure.ts:80-126 + media.ts | использовать v2 |
| 17 | Медиа: retry на getFile | нет (одна попытка) | да, exp backoff 3 раза (media.ts:46-75) | использовать v2 ← главный фикс |
| 18 | attachment_status='failed' | нет | да (media.ts:5-17) | использовать v2 ← плашка |
| 19 | Avatar download fire-and-forget | downloadAndSaveTelegramAvatar (index.ts:369-376) | fetch-telegram-avatar invoke (sync.ts:136-144) | использовать v2 |
| 20 | Auto-create participant | INSERT + 23505 dedup (index.ts:326-378) | findOrCreateParticipant (participants.ts) | использовать v2 |
| 21 | Webhook авторизация | secret в integration.id через header | то же | использовать v2 |
| 22 | Auto-binding группы при /link | (index.ts:541-594) | cmdLink в commands.ts | использовать v2 |
| 23 | Personal dialogs (диалоги вне проекта, project_id=NULL) | НЕТ в v1 | cmdStartPrivate (commands.ts:82-99) | только workspace mode |
| 24 | Логирование ошибок | console.error | console.error | использовать v2 |
| 25 | Структуры данных, типы | свои в index.ts | в types.ts | использовать v2 |

---

## 🔴 КРИТИЧЕСКИЕ НАХОДКИ (без них миграция сломает всё)

### 1. `bot_version='v2'` фильтр в `bindings.ts:17`

`findChatBinding` ищет привязку ТОЛЬКО среди `bot_version='v2'`. Все 68 чатов на v1 после переключения webhook URL **перестанут находить binding** → сообщения упадут в никуда.

**Решение:** миграция данных перед переключением каждого бота:
```sql
UPDATE project_telegram_chats
SET bot_version='v2'
WHERE workspace_id='8a946780-...'
  AND integration_id='<pilot_employee_bot_id>'
  AND bot_version='v1';
```
Это нужно делать **атомарно** с `setWebhook` через Bot API на v2-URL. Окно между двумя операциями = окно потери сообщений.

### 2. `asPersonalBot` хардкод в null

`sync.ts:132` всегда передаёт `null`. Это означает:
- `telegram_bot_integration_id` в `project_messages` будет null для всех сообщений
- multi-bot dedup сломается (UNIQUE-индекс не различит ботов корректно)
- `has_personal_bot` флаг не выставится → реплаи между сотрудниками потеряются

**Решение:** при `mode='employee'` подготовить `{integrationId, workspaceId, botId}` из `integration.config.bot_id` и передавать в `syncTelegramIncomingMessage`.

### 3. `migrate_to_chat_id` отсутствует в v2

Когда обычная группа превращается в супергруппу, Telegram присылает `update.message.migrate_to_chat_id` — это NEW chat_id того же чата. v1 это обрабатывает (index.ts:185-187), v2 — нет.

**Если миграция группы произойдёт во время процесса** — потеряем привязку.

**Решение:** добавить обработку в `pure.ts:getServiceMessageText()` + UPDATE `project_telegram_chats.telegram_chat_id`.

### 4. Поле `integration_id` в `project_telegram_chats`

В таблице **есть колонка `integration_id`** — это позволяет различать ботов в одной группе. v2 `findChatBinding` сейчас её НЕ использует — фильтрует только по `chat_id + bot_version`. После расширения нужно понять: учитывать ли её, или оставить «одна привязка на чат».

### 5. workspace_bot и employee_bot в одной группе

В одной группе могут сидеть и workspace_bot, и employee-боты (для multi-bot dedup). Каждый получит webhook, но **в `project_telegram_chats` запись ОДНА**. Это значит "primary" бот чата = тот, чей integration_id записан в binding. Остальные — гости. Это работает через dedup.

После унификации в v2 — это не меняется. Просто все webhook'и теперь идут в v2 entry-функцию, каждый со своим `integration_id`. Победитель dedup'а решается на уровне БД.

---

## ПЛАН РЕАЛИЗАЦИИ (две сессии)

### Фаза 1: Подготовка кода (1.5-2 часа, безопасно)

Делается **без миграции данных** и **без `setWebhook`**. v1 продолжает обслуживать все 68 чатов. Деплой v2 ничего не ломает, потому что Telegram пока не шлёт на v2 ни одного employee-бота.

1. **`v2/index.ts`** — снять фильтр `type !== telegram_workspace_bot`. Определить `mode = 'workspace' | 'employee'`. Прокинуть в `handleMessage`/`handleCallback`.
2. **`v2/sync.ts`** — заменить `asPersonalBot: null` на условное:
   - `mode === 'workspace'` → `null`
   - `mode === 'employee'` → `{ integrationId, workspaceId, botId: integration.config.bot_id }`
3. **`v2/pure.ts:getServiceMessageText`** — добавить ветку `migrate_to_chat_id`.
4. **`v2/sync.ts`** — если есть `msg.migrate_to_chat_id`, дополнительно `UPDATE project_telegram_chats SET telegram_chat_id = new_id WHERE telegram_chat_id = old_id` (как в v1 index.ts:185-187).
5. **`v2/commands.ts`, `callbacks.ts`, `upload-slot.ts`, `knowledge.ts`** — ранний return при `mode === 'employee'`. Только `/start`, `/link`, `/unlink` остаются доступны для employee (нужны для админ-привязки).
6. **`v2/bindings.ts`** — оставить как есть (фильтр по `bot_version='v2'`). Миграция данных перенесёт всех на v2.
7. **TypeCheck + lint + тесты + деплой v2.** v1 ни в коем случае не трогаем.

### Фаза 2: Миграция данных + pilot (4-6 часов, аккуратно)

Делается отдельной сессией, на свежую голову.

8. **Выбрать pilot-employee-бота** — самого неактивного (например, по числу сообщений за неделю): SQL запрос.
9. **Бэкап**:
   ```sql
   CREATE TABLE _backup_project_telegram_chats_20260528 AS
     SELECT * FROM project_telegram_chats;
   ```
   Плюс через Telegram Bot API сохранить текущий webhook URL pilot-бота: `GET /getWebhookInfo` → записать.
10. **Атомарно (одна транзакция или последовательность в течение секунд):**
    - `UPDATE project_telegram_chats SET bot_version='v2' WHERE integration_id='<pilot_bot_id>'`
    - `POST https://api.telegram.org/bot<TOKEN>/setWebhook?url=<v2_URL>&secret_token=<integration_id>`
11. **Смок-тест pilot** — попросить пользователя:
    - Отправить текст от клиента → проверить что сообщение в `project_messages` с `telegram_bot_integration_id=<pilot_bot_id>`
    - Отправить фото без подписи → проверить `attach_count=1`
    - Отправить документ с подписью → проверить content и attach
    - Отправить media_group из 3 файлов → 3 сообщения с attach=1 каждое
    - Отправить стикер → content «🟪 Стикер …» + thumbnail
    - Поставить реакцию → проверить `message_reactions`
    - Изменить сообщение → проверить `is_edited=true`
    - Написать `/start` боту в личке → бот молчит (employee mode)
    - Написать `/menu` в группе → бот молчит (employee mode)
12. **Наблюдение 30 минут** — мониторить `attachment_status='failed'` и любые ошибки в Edge Function logs.
13. **Если всё ОК** — переключить остальных 2 employee-ботов одинаковым способом (один за другим, по 15 минут между).
14. **Финал** — обновить документацию (`channels.md`, `infrastructure.md`, `gotchas.md`), бэклог-задачу пометить как resolved.
15. **Через 1-2 недели** стабильности — удалить v1: `supabase functions delete telegram-webhook`. До тех пор v1 остаётся жив как hot-fallback.

---

## ПЛАН ОТКАТА

Если что-то ломается в любой момент:

### Откат фазы 1 (только код v2):
```bash
git revert <commit_hash>
supabase functions deploy telegram-webhook-v2 --no-verify-jwt --project-ref zjatohckcpiqmxkmfxbs
```
v1 и так живой, переключение не нужно.

### Откат фазы 2 (после миграции данных pilot):
```sql
-- Восстановить bot_version
UPDATE project_telegram_chats SET bot_version='v1'
WHERE integration_id='<pilot_bot_id>';
```
```bash
# Восстановить webhook URL на v1
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<v1_URL>&secret_token=<integration_id>"
```
v1 продолжит работать как раньше. Через 30 сек всё восстановится.

---

## РИСКИ (резюме)

- 🔴 **68 живых клиентских чатов.** Ошибка во время переключения = реальные клиенты не получают сообщения.
- 🔴 **Окно потери сообщений** между UPDATE и setWebhook. Минимизировать — делать оба действия в одной сессии без задержек.
- 🟠 **multi-bot dedup** через UNIQUE-индекс. Любая ошибка в передаче `asPersonalBot` → дубли вернутся как до 2026-05-13.
- 🟠 **Bot API кеширование** — после `setWebhook` Telegram может ещё пару минут слать на старый URL. Решение: оставить v1 живым на 24 часа.
- 🟡 **Группы, которые мигрировали из обычных в супергруппы** — chat_id мог поменяться. Если в момент миграции пришёл `migrate_to_chat_id`, без обработки v2 потеряет binding. Сначала **обязательно** добавить обработку этого события в v2.

---

## КРИТИЧЕСКИЕ ПРАВИЛА БЕЗОПАСНОСТИ ВО ВРЕМЯ РАБОТЫ

См. также `~/.claude/projects/.../memory/feedback_no_test_insert_into_project_messages.md`.

- **НЕ делать `INSERT INTO project_messages`** для тестирования — триггер `notify_telegram_on_new_message` отправит реальное сообщение в Telegram клиенту. Тестировать через отправку реальных сообщений через UI.
- **НЕ deploy один webhook без обновления другого**, если правка касается `_shared/syncTelegramIncomingMessage.ts` или общей логики.
- **Не удалять v1** до подтверждения недели стабильности на v2.
- **`git status` перед началом** — убедиться что нет незакоммиченных правок чужой работы.

---

## СВЯЗАНО

- [`docs/bugs/open/2026-05-27-telegram-lost-attachments.md`](../bugs/open/2026-05-27-telegram-lost-attachments.md) — фикс потерь файлов, частично применён только к v2. После унификации статус → resolved.
- [`docs/feature-backlog/2026-05-27-inbox-materialized-sort-at.md`](2026-05-27-inbox-materialized-sort-at.md) — отдельная задача масштабирования инбокса, не связана.
- `.claude/rules/channels.md` → раздел Telegram (групповой бот) → таблица распила v2.
- `.claude/rules/gotchas.md` → раздел `notify_telegram_on_new_message` и multi-bot dedup.
- `.claude/rules/infrastructure.md` → `--no-verify-jwt`.

---

## КОГДА НАЧИНАТЬ

В новом диалоге, на свежую голову. Прочитать **этот файл целиком** перед первой строчкой кода. Стратегия двух фаз обязательна — не делать в одну сессию.
