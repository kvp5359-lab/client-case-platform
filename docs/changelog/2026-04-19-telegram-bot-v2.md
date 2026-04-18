# Telegram-бот v2: полезные материалы, требования, загрузка, статус

**Дата:** 2026-04-19
**Тип:** feat
**Статус:** completed

---

## Контекст

У продакшн-бота `@...` (v1) только синхронизация сообщений группы ↔ `project_messages`. Клиент не мог самостоятельно посмотреть полезные материалы проекта, загрузить документ в нужный слот или проверить, что ещё не заполнено. Всё шло через юриста в чате.

Задача — отдельный бот с расширенным UX, **не трогая** существующего. Старые группы должны продолжать работать без изменений, новые — через новый бот.

## Решение

Новый Telegram-бот `@rs2_support_bot` + отдельная Edge Function `telegram-webhook-v2`. Изоляция от старого бота — колонка `project_telegram_chats.bot_version ∈ ('v1','v2')`: старый код про неё не знает (все существующие строки получают default `'v1'`), новая функция фильтрует строго по `'v2'`. Все исходящие edge-функции (`telegram-send-message`, `-edit-`, `-delete-`, `-set-reaction`) теперь выбирают токен бота по `bot_version` через общий хелпер [`_shared/telegramBotToken.ts`](../../supabase/functions/_shared/telegramBotToken.ts).

### Подготовка инфраструктуры

- Перенос 53 edge-функций из репо `ClientCase` → в текущий репо (скачаны из live Supabase через `supabase functions download`, чтобы исходники совпадали с задеплоенным). Ранее они жили в старом Vite-проекте, откуда в этом сезоне переехали на Next 16.
- `.claude/rules/` теперь трекается в git — инфраструктурные правила больше не теряются при клонировании.
- `infrastructure.md` дополнен разделом про Edge Functions.
- Ветка `feat/migrate-edge-functions`, 7 коммитов.

### Меню и навигация

Главное меню — 4 inline-кнопки в две пары:

```
[📚 Полезные материалы]  [❓ Требования]
[📎 Загрузить документ]  [📊 Статус документов]
```

`mainMenuInlineKeyboard()` вынесен в хелпер, используется и в команде `/menu`, и в callback `menu_home` — никакого дублирования. Постоянная reply-кнопка «📋 Меню» снизу ставится на `/link` через `menuReplyKeyboard()` (на десктопе Telegram привязывает её к сообщению-установщику и показывает как reply-context — это квирк клиента, не баг). Команды `/menu`, `/knowledge`, `/requirements`, `/upload`, `/status`, `/help` зарегистрированы через `setMyCommands` — выпадают по тапу на `/`.

### Полезные материалы

Плоская структура, как в web-UI вкладки «Полезные материалы» проекта. Статьи фильтруются через шаблон проекта (`projects.template_id` → `knowledge_article_templates` + `knowledge_group_templates`), **не** через весь workspace. Никаких дополнительных флагов типа `is_public_for_clients` — доступность определяется тем, что статья включена в шаблон (первая попытка с отдельным флагом откатила миграция [`20260418_drop_is_public_for_clients.sql`](../../supabase/migrations/20260418_drop_is_public_for_clients.sql): юристу не нужно двойной галкой подтверждать то, что он уже сделал курацией шаблона).

Рендер контента: `tiptap.ts` определяет формат (Tiptap JSON или HTML-строка из `generateHTML`) и конвертирует в Telegram-HTML через общий [`_shared/htmlFormatting.ts`](../../supabase/functions/_shared/htmlFormatting.ts). В `htmlFormatting.ts` добавлена обработка `<h1>..<h6>` — Telegram их не понимает, эмулируем `<b>` с отбивками (`━━━ H1 ━━━`, `▸ H2`, просто `<b>H3</b>`). Чанкинг статей на куски по 4000 символов (лимит `sendMessage` — 4096).

### Требования к документам

Новый раздел — список папок проекта, у которых в веб-UI есть «?» (колонка `folders.knowledge_article_id`). Клик на папку → рендер привязанной статьи. Из статьи требований кнопка «Загрузить в группу X» сразу ведёт в список слотов той же папки (переиспользует callback `upload_folder`). Зеркально, с экрана слотов папки есть кнопка «❓ Прочитать требования» (callback `folder_article`).

### Загрузка документов

Двухуровневая навигация:

**Шаг 1** — список папок с прогрессом: `📁 ОБРАЗОВАНИЕ И ОПЫТ РАБОТЫ (2/6)`, полностью заполненные помечены `✓`. Отдельные кнопки «📁 Загрузить без привязки» (документ попадает в проект с `folder_id=null` — раздел «БЕЗ ПАПКИ») и «📂 Прочие слоты» (если есть слоты без папки).

**Шаг 2** — пустые слоты выбранной папки + кнопка «📁 Загрузить в эту папку (без слота)» — документ попадает в папку с `folder_id=<…>`, но не привязывается к конкретному слоту.

**Multi-file:** Telegram шлёт media group как отдельные webhook-вызовы с одним `media_group_id`. Первый файл отправляет подтверждение, сохраняет `batch_msg_id` в сессии; следующие файлы той же группы — не плодят новые сообщения, а **редактируют** первое, добавляя имена в список. Для одиночных файлов без media group — каждый получает своё подтверждение. Кнопка «✅ Готово» (callback `upload_finish`) завершает сессию без переписывания истории (в отличие от «❌ Отмена», которая трёт сообщение на «Загрузка отменена»).

**Extract-text:** после успешной загрузки бот делает fire-and-forget вызов edge-функции `extract-text` — чтобы `documents.text_content` заполнился, документ попал в пикер «Выбрать из проекта» и заработала кнопка «Просмотреть содержимое». Для этого в `extract-text` добавлена поддержка внутреннего вызова через `x-internal-secret` (без user-JWT) — тот же механизм, что уже был в `telegram-send-message`.

**Service RPC:** оригинальные `add_document_version` и `fill_slot_atomic` проверяют `auth.uid()`, при service-role вызове это `NULL` → проверка падает. Миграция [`20260418_telegram_bot_service_rpcs.sql`](../../supabase/migrations/20260418_telegram_bot_service_rpcs.sql) добавила `*_service`-варианты без этой проверки; авторизация — на стороне бота (проверка привязки группы через `project_telegram_chats`).

### Статус документов

Отчёт `📊 Статус документов` — все слоты проекта, сгруппированные по папкам:

```
ОБРАЗОВАНИЕ И ОПЫТ РАБОТЫ
  ✅ Диплом об образовании: DIPLOMA … .pdf
  ❌ Письмо от работодателя 2 · пусто
  …

БЕЗ ПАПКИ
  📄 Apple MacBook factura.pdf
  📄 iCloud factura.pdf

Всего: заполнено 9, пусто 7, без папки 2
```

Пустые слоты — `❌`. Раздел «БЕЗ ПАПКИ» (`folder_id IS NULL`) добавлен в конец. Статус слота подтягивается через join со `statuses.name`.

### Служебные события в чат проекта

Бот пишет в `project_messages` технические уведомления для команды:

- `👁️ Кирилл открыл(а) статью «…»` — просмотр полезного материала
- `👁️ Кирилл открыл(а) требования к группе «…»` — просмотр требований папки
- `📎 Кирилл загрузил(а) документ «…» в слот «…»` — загрузка в слот/папку/«без папки»

Для счётчика непрочитанных — отдельное значение enum `message_source='bot_event'` (миграция [`20260418_message_source_bot_event.sql`](../../supabase/migrations/20260418_message_source_bot_event.sql)). RPC `get_inbox_threads_v2` уже исключал `telegram_service` из подсчёта; `bot_event` туда не попадает → **дёргает бейдж**. Просмотры остаются `telegram_service` — видны в чате как тонкие плашки, но бейдж не трогают.

Важный фикс триггера: `notify_telegram_on_new_message` шлёт новые `project_messages` обратно в Telegram через `telegram-send-message`. Для `bot_event` это создавало дубль (бот уже прислал пользователю полноценное сообщение с кнопками). Миграция [`20260418_notify_telegram_skip_bot_event.sql`](../../supabase/migrations/20260418_notify_telegram_skip_bot_event.sql) добавляет `bot_event` в список исключений.

UI-часть ([`MessageList.tsx`](../../src/components/messenger/MessageList.tsx)): условие `msg.source === 'telegram_service'` → теперь `msg.source === 'telegram_service' || msg.source === 'bot_event'`. Оба типа рендерятся одинаковой тонкой плашкой.

### Безопасность и выбор бота

`project_telegram_chats.bot_version text NOT NULL DEFAULT 'v1' CHECK (bot_version IN ('v1','v2'))` — все существующие 58 строк остались `'v1'`. Старый бот их обслуживает без изменений (он вообще не знает про колонку). Новый бот фильтрует каждый `findChatBinding()` по `bot_version='v2'` — даже если его случайно добавят в старую группу, он проигнорирует сообщения.

Секреты в Supabase: `TELEGRAM_BOT_TOKEN_V2`, `TELEGRAM_WEBHOOK_SECRET_V2`. Старые `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET` не тронуты.

## Файлы

### Новые

- `supabase/functions/telegram-webhook-v2/index.ts` — основная функция (~2000 строк): message sync, callbacks, menu, knowledge, upload, status, requirements
- `supabase/functions/telegram-webhook-v2/callback-data.ts` — encode/decode `callback_data` (64-байтный лимит Telegram)
- `supabase/functions/telegram-webhook-v2/tiptap.ts` — рендер статей (JSON/HTML → Telegram HTML, чанкинг)
- `supabase/functions/_shared/telegramBotToken.ts` — выбор токена по `bot_version`
- `scripts/telegram-setup-webhook-v2.ts` — разовая регистрация webhook
- `supabase/config.toml` — перенесён из старого репо
- `supabase/functions/**` (53 функции + `_shared/` + `types/deno.d.ts` + `tsconfig.json`) — перенесены из старого репо ClientCase
- `supabase/migrations/20260418_telegram_bot_v2.sql` — `bot_version`, `telegram_link_tokens`, `telegram_bot_sessions`
- `supabase/migrations/20260418_telegram_bot_service_rpcs.sql` — `add_document_version_service`, `fill_slot_atomic_service`
- `supabase/migrations/20260418_message_source_bot_event.sql` — добавление `'bot_event'` в enum
- `supabase/migrations/20260418_notify_telegram_skip_bot_event.sql` — триггер пропускает `bot_event`
- `supabase/migrations/20260418_drop_is_public_for_clients.sql` — откат колонки (использовался флаг шаблона вместо неё)

### Изменённые

- `supabase/functions/_shared/htmlFormatting.ts` — обработка `<h1>..<h6>` для Telegram HTML
- `supabase/functions/extract-text/index.ts` — поддержка внутреннего вызова через `x-internal-secret`
- `supabase/functions/telegram-send-message/index.ts`, `telegram-edit-message/index.ts`, `telegram-delete-message/index.ts`, `telegram-set-reaction/index.ts` — выбор токена через `resolveBotToken()`
- `src/components/messenger/MessageList.tsx` — `bot_event` рендерится как `telegram_service` (тонкая плашка)
- `.claude/rules/infrastructure.md` — раздел про Edge Functions
- `.gitignore` — трекаем `.claude/rules/`

## Что дальше

- Web-UI для администратора: кнопка «Привязать Telegram» в профиле участника (генерит `telegram_link_tokens` → deep-link в личку бота). Сейчас `/start <token>` в боте уже работает, UI-части нет.
- Postponed: WebApp / MenuButton с `web_app` — при необходимости полноценного мини-приложения вместо списка команд.
- Миграция прод-групп с v1 на v2 — после полной проверки v2 переведём одну тестовую боевую группу, затем поэтапно остальные.
