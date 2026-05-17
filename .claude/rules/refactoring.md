# ClientCase Platform — Зоны рефакторинга

Зоны для проведения аудита кода по глобальному фреймворку (`~/.claude/CLAUDE.md` → «Рефакторинг по зонам»).

При запуске аудита проект проходится **по всем зонам последовательно**. Для каждой зоны — отчёт с проблемами (файл, серьёзность, описание, решение).

---

## 🚫 Карантинные зоны (НЕ трогать при полном аудите)

Эти части проекта **работают и оттестированы боем**, но содержат много неявных контрактов между БД-триггерами, edge functions и фронтом. Любая «оптимизация» или «упрощение» в этих местах исторически ломала переписку с клиентами (логировано: 3+ инцидента с RLS на `project_threads`, регулярные сбои отправки сообщений после рефакторинга общих хелперов).

**Правило**: при команде «полный аудит» / «рефакторинг» эти зоны **пропускаются**. В отчёте указать одной строкой: «Карантинные зоны не аудировались». Трогать **только** если пользователь явно сказал «отрефактори телегу / wazzup / мессенджер / email / mtproto».

### Что в карантине

**Edge Functions** (мессенджер-каналы):
- `supabase/functions/telegram-webhook*`, `telegram-send-message`, `telegram-edit-message`, `telegram-delete-message`, `telegram-set-reaction`
- `supabase/functions/telegram-business-*`
- `supabase/functions/telegram-mtproto-*`
- `supabase/functions/wazzup-*`
- `supabase/functions/gmail-*`, `email-internal-send`, `email-track`, `provision-email-domain`, `provision-domain`
- `supabase/functions/_shared/syncTelegramIncomingMessage.ts`, `syncTelegramReactions.ts`, `htmlFormatting.ts`, `edge.ts`, `cors.ts`, `ai-chat-setup.ts`

**Сервис MTProto** (отдельный Node-сервис на VPS):
- `mtproto-service/` целиком

**Фронт мессенджера**:
- `src/components/messenger/`
- `src/hooks/messenger/`
- `src/services/messengerService.ts`, `messengerReactionService.ts` (если есть)

**Критичные места в БД** (только смотреть, менять — только по явному запросу):
- Триггер `notify_telegram_on_new_message` и связанные функции (`dispatch_send_http`, `retry_undelivered_telegram_messages`)
- RLS-полиция `project_threads_select` (требование short-circuit `created_by = auth.uid()` — см. infrastructure.md)
- UNIQUE-индексы дедупликации сообщений (`uq_telegram_message_per_chat`, `uq_project_messages_telegram_content_dedup` и т.п.)

### Если пользователь явно просит трогать карантин

1. Перед изменениями — прочитать соответствующие разделы [`infrastructure.md`](./infrastructure.md): «Telegram Business», «Wazzup», «Мессенджер-каналы — единая справка», «RLS на `project_threads`», «Дедуп между несколькими ботами».
2. После изменений — обязательный смок-тест: отправка из сервиса (TG group / Business / MTProto / Wazzup / Email), приём входящего, реплай, реакция, дедуп при двойном приёме.
3. Не трогать общие хелперы в `_shared/` ради рефакторинга — только точечные правки под конкретную задачу.

---

## Зона 1. 🔒 Безопасность и RLS

**Что проверяем:**
- Все таблицы в `public` имеют включённый RLS
- Политики RLS не допускают утечек данных между воркспейсами
- `SUPABASE_SERVICE_ROLE_KEY` нигде не попадает в клиентский код
- Секреты (`NEXT_PUBLIC_*` только для публичных значений)
- Supabase advisors: security warnings
- `src/lib/supabase.ts` (anon) vs `src/lib/supabase-server.ts` (SSR) — разделение чёткое
- Middleware `src/proxy.ts` защищает приватные роуты (в Next 16 файл переименован из `middleware.ts`)
- Нет утечек токенов в логи и в `console.log`

## Зона 2. 🗄️ БД, миграции, RPC

**Что проверяем:**
- Все миграции в `supabase/migrations/` применены и идемпотентны
- RPC-функции фильтруют `is_deleted = false` (корзина)
- Индексы на часто запрашиваемых колонках (workspace_id, project_id, is_deleted)
- Нет дубликатов таблиц или устаревших колонок после миграций
- `search_path` в SECURITY DEFINER функциях
- Supabase advisors: performance warnings
- `project_template_tasks` дропнута 2026-04-11 (миграция `20260411_drop_project_template_tasks.sql`) — все задачи теперь в `thread_templates`. Проверять, что в коде нет осиротевших ссылок (кроме комментариев)

## Зона 3. 🔑 Типы и контракты

**Что проверяем:**
- `src/types/database.ts` соответствует реальной схеме БД
- Минимум `any`, `unknown` (с обоснованием)
- Zod-схемы совпадают с TS-типами
- `src/types/permissions.ts`, `src/types/threadTemplate.ts` — синхронизированы с БД
- Нет «осиротевших» типов после удаления фич
- TypeScript strict mode, нет `@ts-ignore` без причины

## Зона 4. ⚛️ React Query

**Что проверяем:**
- Все query keys — в `src/hooks/queryKeys.ts` (единый источник)
- Инвалидации после мутаций: попадают в правильные ключи
- `staleTime` и `gcTime` настроены осмысленно (не дефолтные на критичных данных)
- Нет дублирующих запросов (два хука на одни и те же данные)
- `select` для нормализации, а не маппинг в компоненте
- Optimistic updates там, где это даёт реальный UX-выигрыш

## Зона 5. 🏪 Zustand-сторы

**Что проверяем:**
- `src/store/*` — селекторы используются, а не достаётся весь стор
- Нет утечек: стор чистится при логауте/смене воркспейса
- `sidePanelStore` — single source of truth, нет дублирования состояния в компонентах
- Нет клиентского стора там, где хватит React Query

## Зона 6. 🧩 Компоненты и структура

**Что проверяем:**
- Файлы > 400 строк — кандидаты на разбиение
- `src/page-components/` — только страницы, `src/components/` — переиспользуемое
- Нет дубликатов UI (две одинаковые кнопки, две похожие формы)
- shadcn/ui используется единообразно (не смешано с кастомными `<button>`)
- Мёртвые пропсы и неиспользуемые экспорты
- Правильный мемо: `memo`, `useMemo`, `useCallback` — только где есть профит
- Нет inline-функций, создающих лишние ре-рендеры в hot paths

## Зона 7. 🛣️ Роутинг и права доступа

**Что проверяем:**
- `ProtectedRoute` применён на всех приватных роутах
- `useProjectPermissions` — единый источник правды для проверки прав
- Публичные (`app/(public)/`) vs приватные (`app/(app)/`) разделены корректно
- Нет прав, проверяемых «на глаз» в JSX (должно идти через хуки)
- `module_access` в `project_roles` — консистентен с `enabled_modules`

## Зона 8. 🧪 Тесты

**Что проверяем:**
- `npm test` проходит, нет скипнутых без причины
- Критичные хуки (permissions, query keys, mutations) покрыты
- Нет падающих тестов, закомментированных «потом починим»
- Vitest config не ломает TypeScript-проверки

## Зона 9. 📦 Сборка, зависимости, lint

**Что проверяем:**
- `npm run build` проходит без warnings
- `npm run lint` — 0 ошибок
- Нет неиспользуемых зависимостей в `package.json`
- Нет дубликатов библиотек (два date-picker, два toast)
- Размер бандла: нет случайных импортов `lodash` целиком, иконок пачками
- Next.js 16 App Router: нет устаревших `getServerSideProps` / `pages/`

## Зона 10. 🐛 Баг-лог и документация

**Что проверяем:**
- `docs/bugs/open/` — каждый баг всё ещё актуален (не починен случайно)
- `docs/bugs/resolved/` — бага действительно нет (прогнать регресс)
- `.claude/rules/infrastructure.md` соответствует реальности
- Нет `TODO` / `FIXME` в коде без задач в баг-логе
- Нет мёртвых файлов: `.bak`, `old_*`, `*.orig`

---

## Как запускать

Пользователь говорит «аудит» / «полный аудит» — проходимся по всем зонам.
Пользователь говорит «аудит зоны N» или «проверь безопасность» — только одна зона.

Отчёт — по формату из `~/.claude/CLAUDE.md`:
- Файл:строка
- Зона
- Серьёзность: 🔴 критическая / 🟠 средняя / 🟡 низкая
- Описание (простым языком)
- Решение
