# ClientCase Platform — Infrastructure

## Git workflow

**Работаем напрямую в `main`** — без feature-веток по умолчанию. Не предлагать создание отдельной ветки под новую задачу, если пользователь явно не попросил. Коммиты делаем прямо в `main` (по логическим блокам — отдельный коммит на каждое смысловое изменение).

## Баг-лог

Известные баги — в `docs/bugs/`. Индекс: [`docs/bugs/README.md`](../../docs/bugs/README.md). Открытые — в `docs/bugs/open/`, решённые — в `docs/bugs/resolved/`. При жалобе на странное поведение **сначала** заглянуть в индекс — возможно, баг уже расследован и есть готовые гипотезы.

## Тестирование

Бэклог тестов: [`docs/testing-backlog.md`](../../docs/testing-backlog.md). Что покрыто, что осталось, в каком порядке делать. **Перед добавлением новых тестов** — заглянуть туда: возможно, область уже покрыта, или для неё есть план и принципы. Обновлять файл после каждой завершённой волны тестов.

## Стек

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | 16.x (App Router) | Фреймворк, SSR + SPA |
| React | 19.x | UI-библиотека |
| TypeScript | 5.x | Типизация |
| Tailwind CSS | 3.x | Стили (JS-конфигурация) |
| shadcn/ui | latest | UI-компоненты (41 файл в `src/components/ui/`) |
| Radix UI | latest | Примитивы для UI |
| TanStack React Query | 5.x | Серверное состояние |
| Zustand | 5.x | Клиентское состояние |
| Формы | — | Нативные `useState` + контролируемые компоненты. Ни `react-hook-form`, ни `zod` в проекте не используются (исторически были в шаблоне shadcn-init, но реальные формы в коде написаны на чистом React). |
| Tiptap | latest | Rich text editor |
| @dnd-kit | latest | Drag & drop |
| Supabase JS | 2.x | БД, Auth, Storage, Realtime |
| Vitest | 4.x | Тесты (620+ кейсов) |

## Архитектура

- **Фронтенд**: Next.js App Router. Клиентский код в `src/`, страницы и layout-ы — в `src/app/`
- **Бэкенд**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Стилизация**: Tailwind 3 + CSS Variables (HSL) + shadcn/ui
- **Состояние**: React Query (серверное) + Zustand (клиентское)
- **Структура**: `src/page-components/` (тяжёлые компоненты страниц), `src/components/` (переиспользуемые компоненты по модулям)
- **Публичная часть**: `src/app/(public)/` — заглушки для маркетплейса (lawyers, blog, about)
- **Приватная часть**: `src/app/(app)/` — защищена цепочкой middleware → server-side `(app)/layout.tsx` → клиентский `ProtectedRoute` → RLS в БД. Файл middleware называется `src/proxy.ts` (новое стандартное имя в Next 16, ранее `middleware.ts`).

## Supabase

- Проект: `zjatohckcpiqmxkmfxbs`
- URL: `https://zjatohckcpiqmxkmfxbs.supabase.co`
- Общая БД с оригинальным ClientCase
- SSR клиент: `src/lib/supabase-server.ts`
- Клиентский: `src/lib/supabase.ts`

### Edge Functions

- Исходники: `supabase/functions/` — 53 функции + `_shared/` (общие модули) + `types/deno.d.ts` + `tsconfig.json`.
- Конфиг: `supabase/config.toml` (локальная разработка Supabase).
- **Перенесены из старого репо `ClientCase` 2026-04-18** (ветка `feat/migrate-edge-functions`, коммит `c03f0dc`). Скачаны напрямую из live Supabase через `supabase functions download`, то есть исходники в репо ровно соответствуют тому, что задеплоено и работает в проде. Старый репо `ClientCase` как источник правды больше не используется — там остались некоторые незадеплоенные изменения, которые в момент переноса были признаны неактуальными.
- **Деплой функции**: `supabase functions deploy <name> --project-ref zjatohckcpiqmxkmfxbs`. Через CI пока не автоматизировано — деплой вручную.
- **⚠️ `--no-verify-jwt` — ОБЯЗАТЕЛЬНО** для функций, которые вызываются без пользовательского JWT: `telegram-webhook` (от Telegram), `telegram-send-message` (от postgres-триггера через `net.http_post`). CLI по умолчанию ставит `verify_jwt = true`, и шлюз Supabase отбивает запросы на уровне инфраструктуры до нашего кода — получаем `UNAUTHORIZED_NO_AUTH_HEADER` в `net._http_response.content`. Если задеплоил без флага — redeploy с `--no-verify-jwt`.
- **Секреты (env vars)**: управляются через `supabase secrets set KEY=value --project-ref zjatohckcpiqmxkmfxbs`. Если `supabase secrets list` показывает значение, но функция его не видит — принудительно переустановить тем же `secrets set`. Это «оживит» его в рантайме функции.
- **`x-internal-secret`**: триггер `notify_telegram_on_new_message` шлёт этот header. Его значение должно совпадать с env-переменной `INTERNAL_FUNCTION_SECRET` в Supabase secrets. Если разошлись — все исходящие сообщения из ЛК в Telegram отбиваются с 401 от нашего кода. Для диагностики: `SELECT content, status_code FROM net._http_response ORDER BY created DESC LIMIT 10;`.
- **Категории функций** (на 2026-05-11, ~75 шт):
  - **Telegram (групповой бот)**: `telegram-webhook` (v1, активный), `telegram-webhook-v2` (новый, для bot_version='v2'), `telegram-setup-webhook`, `telegram-register-webhook`, `telegram-send-message`, `telegram-edit-message`, `telegram-delete-message`, `telegram-set-reaction`.
  - **Telegram Business**: `telegram-business-webhook`, `telegram-business-send`, `telegram-business-react`, `telegram-business-link-init`.
  - **Telegram MTProto** (личный аккаунт через gramjs-сервис): `telegram-mtproto-auth`, `telegram-mtproto-send`, `telegram-mtproto-react`, `telegram-mtproto-backfill`. Также аватары: `fetch-telegram-avatar`.
  - **Wazzup** (WhatsApp/IG): `wazzup-webhook`, `wazzup-send`, `wazzup-send-reaction`, `wazzup-mark-read`, `wazzup-fetch-channels`, `wazzup-set-webhook`.
  - **Email (Gmail OAuth + Resend)**: `gmail-auth`, `gmail-callback`, `gmail-disconnect`, `gmail-webhook`, `gmail-send`, `gmail-watch-refresh`, `email-internal-send`, `email-track`, `provision-email-domain`, `provision-domain`.
  - **Google**: `google-oauth-start/exchange/refresh`, `google-drive-*` (8 функций), `google-sheets-*` (2), `google-docs-export`.
  - **AI**: `chat-with-messages`, `chat-with-documents`, `chat-with-uploaded-file`, `generate-block`, `generate-document`, `generate-merge-name`, `generate-conversation-title`, `generate-project-digest`, `translate-block`, `analyze-documents`, `extract-text`, `extract-placeholders`, `extract-form-data`, `extract-form-data-from-file`, `transcribe-audio`, `knowledge-index`, `knowledge-search`, `check-document`, `test-ai-connection`.
  - **Документы/файлы**: `compress-document`, `compress-pdf`, `compress-pdf-ilovepdf`, `fetch-image`, `fetch-sheets`, `fix-cyrillic-storage-paths`, `export-to-drive`.
  - **Impersonation**: `impersonate-start`, `impersonate-end`.
  - **Sandbox**: `sandbox-test` — dev playground, не вызывается из фронта.

### pg_cron + service_role_key (Gmail watch refresh и подобные)

- pg_cron-джоб `gmail-watch-refresh` (расписание `0 3 * * *`) каждые сутки дёргает Edge Function для продления Gmail watch-подписок (живут 7 дней). Если этот крон падает — через неделю входящие письма перестают доходить в сервис, потому что Gmail прекращает слать Pub/Sub уведомления. Симптом: в `email_accounts.watch_expires_at` дата в прошлом, ответы клиентов видны в Gmail, но не в сервисе.
- **Ключ зашит прямо в команду крона** (`sb_secret_...`, новый формат Supabase API keys). На Supabase Cloud `ALTER DATABASE postgres SET app.settings.service_role_key = '...'` запрещён по правам, поэтому стандартный паттерн `current_setting('app.settings.service_role_key')` не работает — нужно хардкодить значение в команду.
- **Где взять ключ**: Supabase Dashboard → Project Settings → API → вкладка «Publishable and secret API keys» → раздел «Secret keys» (формат `sb_secret_...`). **Важно**: легаси-ключ из вкладки «Legacy anon, service_role API keys» (JWT-формат) **не подходит** — Edge Functions проверяют через `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`, а в env инжектится новый формат. Признак неправильного ключа — функция возвращает 401 `{"error":"Unauthorized"}` (от нашего кода, не от шлюза).
- **При ротации ключа в Supabase** обязательно обновить команду крона:
  ```sql
  SELECT cron.alter_job(
    job_id := (SELECT jobid FROM cron.job WHERE jobname = 'gmail-watch-refresh'),
    command := $$
      SELECT net.http_post(
        url := 'https://zjatohckcpiqmxkmfxbs.supabase.co/functions/v1/gmail-watch-refresh',
        headers := jsonb_build_object(
          'Authorization', 'Bearer sb_secret_НОВЫЙ_КЛЮЧ',
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $$
  );
  ```
- **Ручной триггер** (если watch уже истёк и нужно реактивировать немедленно): тот же `net.http_post` с теми же заголовками, выполнить через SQL Editor. Проверить результат: `SELECT id, status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 1;`. Ожидаемо: 200 OK, `{"refreshed":N,"failed":0,"total":N}`.
- **Диагностика крона**: `SELECT jrd.start_time, jrd.status, jrd.return_message FROM cron.job_run_details jrd JOIN cron.job j ON jrd.jobid = j.jobid WHERE j.jobname = 'gmail-watch-refresh' ORDER BY start_time DESC LIMIT 10;`. Если `status = failed` — смотреть `return_message`.
- **Потерянные письма**: пока watch был мёртв, Gmail Pub/Sub не присылал уведомлений → пропущенные входящие в сервис автоматически не подтянутся (Pub/Sub не повторяет пропуски). Только новые письма с момента реактивации.

## Окружение

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase проекта |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публичный anon ключ |
| `NEXT_PUBLIC_APP_NAME` | Имя приложения |
| `NEXT_PUBLIC_TECHNICAL_ADMIN_EMAILS` | Email техадминов (через запятую) |

## Деплой

- Репозиторий: https://github.com/kvp5359-lab/client-case-platform
- CI/CD: GitHub Actions — build Docker image → push to GHCR → deploy to VPS via SSH
- Workflow: `.github/workflows/deploy.yml` (триггер: push в main или manual dispatch)

### VPS (продакшен)

- **IP**: `72.61.82.244` (hostname: `srv1255608`)
- **SSH**: `ssh vps` (конфиг в `~/.ssh/config`, ключ `~/.ssh/id_ed25519`)
- **Путь проекта**: `/opt/clientcase/`
- **Docker-образ**: `ghcr.io/kvp5359-lab/client-case-platform:latest`
- **Docker-сеть**: `relostart_web` (общая с nginx и другими сервисами)
- **Blue/green деплой** (внедрено 2026-04-27): два контейнера `clientcase-app-blue` (порт 3005) и `clientcase-app-green` (порт 3006). В каждый момент времени запущен только один — активный. Деплой поднимает противоположный цвет, ждёт ответ 200/302/307, переключает nginx upstream и гасит старый. Если новый не поднялся — старый остаётся живым, деплой падает. Никаких 502 во время деплоя.

### Nginx (reverse proxy)

- **Контейнер**: `relostart-nginx` (из `/opt/relostart/`)
- **Конфиги ClientCase** (два домена — два разных файла, оба требуют одинаковых настроек буферов):
  - `/opt/relostart/nginx/conf.d/app-relostart.conf` — для `app.relostart.com`
  - `/opt/relostart/nginx/conf.d/clientcase-kvp.conf` — для `clientcase.kvp-projects.com`
- **Upstream-файл**: `/opt/relostart/nginx/conf.d/clientcase-upstream.conf` — единый блок `upstream clientcase { server clientcase-app-<color>:3000; ... }`. **Управляется деплой-скриптом, руками не править.** Скрипт переписывает этот файл при blue/green переключении.
- **SSL**: Let's Encrypt (certbot контейнер `relostart-certbot`)
- **Буферы прокси (ОБА конфига)**: `proxy_buffer_size 256k; proxy_buffers 8 512k; proxy_busy_buffers_size 512k;`. Меньшие значения дают 502 «upstream sent too big header» на залогиненных запросах — Next.js + Supabase шлёт жирные `Set-Cookie`/RSC headers. **При добавлении нового домена не забыть скопировать буферы.**

### Другие контейнеры на VPS

| Контейнер | Порт | Назначение |
|-----------|------|-----------|
| `relostart-app` | 3000 | Основной Relostart |
| `relostart-app-dev` | 3001 | Relostart dev |
| `migcases-app-dev` | 3002 | MigCases dev |
| `kb-frontend` | 3003 | Knowledge Base frontend |
| `migcases-app-prod` | 3004 | MigCases prod |
| `clientcase-app-blue` | 3005 | **ClientCase blue** (один из blue/green активен) |
| `clientcase-app-green` | 3006 | **ClientCase green** (один из blue/green активен) |
| `kb-backend` | 8000 | Knowledge Base API |
| `kb-qdrant` | 6333 | Qdrant vector DB |

## Маркетплейс (фундамент)

- SQL-миграции: `supabase/migrations/20260404_marketplace_tables.sql` (НЕ применены)
- Таблицы: service_categories, lawyer_profiles, lawyer_services, orders, payments, payouts, reviews, blog_posts, blog_categories, custom_domains
- API Routes: `/api/payments`, `/api/webhooks` (заглушки)

## Корзина (мягкое удаление проектов и тредов)

- **Таблицы**: `projects` и `project_threads` имеют `is_deleted` (BOOLEAN NOT NULL DEFAULT false), `deleted_at`, `deleted_by`.
- **Удаление** проектов и тредов теперь выставляет `is_deleted = true` (не физический DELETE). Физически удаляется только из раздела «Корзина».
- **Раздел «Корзина»** — вкладка в настройках воркспейса (`/workspaces/[id]/settings/trash`), видна только владельцу (`isOwner`). Позволяет восстановить или удалить навсегда.
- **Каскад при удалении проекта**: сам проект помечается `is_deleted = true`, его треды/документы в БД не трогаются, но перестают показываться в списках, потому что RPC фильтруют `project.is_deleted = false`. При восстановлении проекта всё автоматически возвращается.
- **RPC с фильтром**: `get_user_projects`, `get_workspace_threads`, `get_sidebar_data`, `get_my_urgent_tasks_count` — все исключают записи с `is_deleted = true` (и треды из удалённых проектов).
- **Хуки**: `src/hooks/useTrash.ts` — `useTrashedProjects`, `useTrashedThreads`, `useRestoreProject`, `useRestoreThread`, `useHardDeleteProject`, `useHardDeleteThread`.
- **Миграции**: `20260410_trash_feature.sql` (колонки + `get_user_projects`), `20260410_trash_rpc_updates.sql` (остальные RPC).

## Права доступа к модулям проекта

Два независимых слоя, проверяются вместе:

1. **`project_templates.enabled_modules`** (`string[]`) — какие модули в принципе включены в шаблоне проекта (chats/tasks/documents/forms/finance/digest/…). Если модуль не включён в шаблоне — он не существует для проекта ни для кого, включая владельца.
2. **`project_roles.module_access`** (jsonb `{ module: boolean }`) — для каждой проектной роли: к каким модулям эта роль имеет доступ. Резолвится через `useProjectPermissions.hasModuleAccess(module)` (см. [`src/hooks/permissions/useProjectPermissions.ts`](../../src/hooks/permissions/useProjectPermissions.ts)). У пользователя с несколькими ролями — merge через OR.

**Правило: модуль видим, если** `enabled_modules.includes(module) AND hasModuleAccess(module)`. Сейчас нет автосинхронизации: если модуль отключают в шаблоне, в `module_access` ролей он остаётся `true` — но всё равно скрыт фильтром `enabled_modules`. Это by design, чтобы не терять настройку при временном отключении модуля.

**Куда смотреть при добавлении нового модуля**: реестр `ProjectModule` в `src/types/threadTemplate.ts`, `PROJECT_MODULES`, дефолтные `module_access` в seed-ролях, проверка в `useProjectPermissions.hasModuleAccess`.

## Статусы проектов (единый справочник + per-template привязка)

- **Хранение**: `projects.status_id` (uuid → `statuses.id`). Текстовая колонка `projects.status` дропнута миграцией `drop_projects_status_text_with_triggers` (2026-04-25).
- **Модель**: project-статусы лежат в общем справочнике `statuses` (entity_type='project'), без привязки к шаблону. Связь м-к-м с шаблонами — через junction `project_template_statuses (template_id, status_id, order_index, is_default, is_final)`. Один статус может быть подключён к нескольким шаблонам с разными per-template флагами.
- **Резолв набора шаблона**: хук `useProjectStatusesForTemplate(workspaceId, templateId)` — JOIN на junction, возвращает `TemplateProjectStatus[]` (поля shared из `statuses` + per-template `order_index/is_default/is_final` из junction).
- **Все статусы воркспейса**: `useAllProjectStatuses(workspaceId)` — для фильтров/пресетов.
- **Глобальные `is_default/is_final` в `statuses`**: дублируются при сохранении из редактора шаблона как «представительские» значения для фильтра «Активные/Завершённые» в общем списке проектов. Для точного per-template поведения (триггер автоперехода) используется junction.
- **Автопереход**: `thread_templates.on_complete_set_project_status_id`. БД-триггер `auto_advance_project_status` при переходе треда в финальный статус задачи обновляет `projects.status_id`. Last write wins.
- **UI настройки**:
  - В редакторе шаблона проекта (`/templates/project-templates/[id]`) — `ProjectTemplateStatusesSection`: «Из справочника» (multiselect) или «Создать» (даёт новый в справочник + привязку). Drag-n-drop меняет порядок в junction.
  - В общем справочнике (`/directories/statuses`) — все project-статусы воркспейса единым списком.
  - Поле «При завершении перевести проект в статус» в `ThreadTemplateDialog` (только task-режим).
- **Удаление статуса**:
  - Из шаблона (в `ProjectTemplateStatusesSection`) → удаление записи в junction. Сам статус остаётся в справочнике. Если есть проекты этого шаблона в этом статусе → `StatusReassignDialog`, реассайн затрагивает только проекты данного шаблона.
  - Из справочника (`/directories/statuses`) → полное удаление. CASCADE удаляет все junction-записи. Если есть проекты в этом статусе → реассайн.

## Дневник проекта (digests)

Модуль автоматических сводок активности по проектам — введён 2026-04-26.

- **Идея**: для проекта за период (MVP — день, по Europe/Madrid) собираем активность из трёх источников и формируем «карточку дня». Если событий мало — простой список. Если много — сводка через LLM.
- **Источники активности (только чтение)**: `audit_logs`, `project_messages`, `comments`. Изменения в эти таблицы модуль НЕ вносит.
- **Таблицы**:
  - `project_digests` — карточки сводок. Поля: `period_start`, `period_end`, `digest_type` (day/week/month/custom — пока только day), `content`, `raw_events` (jsonb), `events_count`, `generation_mode` (`auto_list`/`llm`), `model`. Уник. ключ `(project_id, period_start, period_end, digest_type)` — повторный запуск перезаписывает.
  - `workspace_digest_settings` — на воркспейс: `system_prompt` (если `null` → дефолт из кода функции), `min_events_for_llm` (порог авто/LLM, default 5), `model`. Редактирует только владелец.
- **Edge Function**: `generate-project-digest` (deployed). Принимает `workspace_id`, `project_id`, опц. `period_start/end`, `force`, `test_run`, `override_prompt`. Использует общий хелпер `_shared/ai-chat-setup.ts` (Anthropic/Gemini, ключ из секретов воркспейса). Логика:
  - Сообщения склеиваются: подряд от одного автора в одном треде в пределах 30 мин → одно событие (экономит токены).
  - 0 событий → не сохраняем (skipped_reason: no_activity).
  - < `min_events_for_llm` → авто-список без LLM.
  - >= порога → зов LLM с системным промптом из настроек или дефолтным.
  - `test_run: true` → возвращает результат, не сохраняет.
- **RPC**: `get_projects_with_activity(workspace_id, period_start, period_end)` — список проектов с активностью за период. Используется страницей сводок воркспейса для пакетного прогона на фронте (вторая Edge Function НЕ нужна — таймауты не угрожают, прогресс-бар точный).
- **Фронтовые хуки** (`src/hooks/useProjectDigests.ts`, `src/hooks/useWorkspaceDigestSettings.ts`):
  - `useProjectDigests(projectId)` — лента карточек проекта.
  - `useWorkspaceDigestsForDate(wsId, date)` — карточки всех проектов за дату.
  - `useProjectsWithActivity(...)` — для пакетного прогона.
  - `useGenerateProjectDigest()` — мутация (вызывает edge function).
  - `useDeleteProjectDigest()` — удалить карточку.
  - `useWorkspaceDigestSettings`/`useUpdateWorkspaceDigestSettings` — настройки.
- **Дефолтный промпт**: `src/lib/digestDefaults.ts` (фронт) и константа `DEFAULT_SYSTEM_PROMPT` в `supabase/functions/generate-project-digest/index.ts` (бэкенд). При изменении синхронизировать оба места.
- **UI**:
  - Вкладка «Дневник» в проекте (модуль `digest` в `PROJECT_MODULES`, доступна всем участникам проекта без проверки прав).
  - Страница `/workspaces/[id]/digests` — пакетный прогон по всем проектам с активностью (concurrency 2 на фронте).
  - Раздел «Дневник проекта» в `/workspaces/[id]/settings/digest` (только владелец) — редактор промпта, порог, выбор модели, тестовый прогон.
- **Миграции**: `20260426_project_digests.sql` (две таблицы + RLS), `20260426_get_projects_with_activity.sql` (RPC).
- **Тайм-зона**: Europe/Madrid. Граничные даты считаются на фронте и передаются в edge function как `YYYY-MM-DD`.

## Настройки сайдбара воркспейса

Состав и порядок верхней части сайдбара (всё кроме списка проектов) — настраиваются на уровне воркспейса. Единая модель: пункты меню, доски и **списки `item_lists`** — это «слоты» одного и того же списка, размещаются в одной из двух зон (топбар/список) или скрываются.

> **Будущий рефакторинг сайдбара** (папки + системные разделы + ссылки + per-role) — backlog: [`docs/feature-backlog/2026-05-10-sidebar-redesign.md`](../../docs/feature-backlog/2026-05-10-sidebar-redesign.md).

- **Таблица**: `workspace_sidebar_settings (workspace_id PK, slots jsonb, updated_at, updated_by)`. RLS: SELECT — любому участнику; INSERT/UPDATE/DELETE — только владельцу. Если строки нет — фронт берёт дефолт из кода (`DEFAULT_SIDEBAR_SLOTS` в `src/lib/sidebarSettings.ts`).
- **Структура `slots`** (массив): `{ id, type, placement, order, badge_mode }`.
  - `id` — `nav:<key>` (пункт меню), `board:<uuid>` (доска) или `list:<uuid>` (список item_lists).
  - `type` — `nav` | `board` | `list`.
  - `placement` — `topbar` (иконка в верхней строке) или `list` (полный пункт в основном списке).
  - `order` — позиция внутри своей зоны.
  - `badge_mode` — режим счётчика, единый набор для пунктов и досок: `disabled` | `my_active_tasks` | `all_my_tasks` | `overdue_tasks` | `unread_messages` | `unread_threads`. Бейджи глобальные по воркспейсу — содержимое конкретной доски/пункта не учитывается.
- **Скрытые элементы** не хранятся — они просто отсутствуют в `slots`. На странице настроек выводятся в секции «Доступные» и оттуда переносятся кнопками «в верх» / «в список». Удаление из сайдбара (× у элемента) возвращает его в «Доступные».
- **Доски в «Доступных»** — все доски воркспейса, которых нет в `slots`. Список рендерится автоматически. Закрепить = добавить в одну из зон, открепить = убрать (× в зоне или PinOff на самой иконке доски в сайдбаре).
- **Мёртвые слоты** (доски, удалённые из воркспейса) — фильтруются на рендере. На странице настроек владельцу показывается предупреждение и кнопка «Очистить» для физического удаления.
- **RPC `get_my_task_counts(workspace_id)`** — батч `{ active, all, overdue }` для бейджей задач (active = «сегодня + просрочка», как старый `get_my_urgent_tasks_count`). При мутациях задач инвалидировать `myTaskCountsKeys.byWorkspace(workspaceId)` рядом с `taskKeys.urgentCount` — уже сделано в `useTrash.ts`, `useProjectThreads.ts`, `TaskListView.tsx`.
- **`hasAccess` фильтр** — даже если пункт меню в `slots`, он скрывается у пользователей без соответствующего permission'а (см. `SIDEBAR_NAV_ITEMS[key].hasAccess`). Например, «Шаблоны» не показываются клиенту.
- **Скрытые роуты остаются доступными по прямой ссылке** — настройка управляет только сайдбаром, middleware не трогаем.
- **Хуки**: `useWorkspaceSidebarSettings`, `useUpdateWorkspaceSidebarSettings`, `useMyTaskCounts` в [`src/hooks/useWorkspaceSidebarSettings.ts`](../../src/hooks/useWorkspaceSidebarSettings.ts). `usePinnedBoards` в [`src/components/WorkspaceSidebar/usePinnedBoards.ts`](../../src/components/WorkspaceSidebar/usePinnedBoards.ts) — адаптер над `slots` для досок (`isPinned`, `togglePin`). Зеркальный `usePinnedItemLists` в [`src/components/WorkspaceSidebar/usePinnedItemLists.ts`](../../src/components/WorkspaceSidebar/usePinnedItemLists.ts) — для списков `item_lists`.
- **UI**: страница `/workspaces/[id]/settings/sidebar` (вкладка «Сайдбар», видна только владельцу). Компонент: [`src/page-components/workspace-settings/SidebarSettingsTab.tsx`](../../src/page-components/workspace-settings/SidebarSettingsTab.tsx). Три зоны: «Верхняя строка», «Список», «Доступные». Перенос между зонами — кнопками (× / стрелка-в-другую-зону), порядок внутри зоны — ↑↓. У каждого размещённого слота свой селектор бейджа. При >6 иконок в топ-баре — мягкое предупреждение.
- **Открепить из самого сайдбара** — кнопка PinOff показывается только владельцу и появляется на месте иконки доски при ховере (через проп `hoverIconSlot` в `SidebarNavButton`). Это сделано чтобы не наезжать на бейдж справа.
- **Миграции**:
  - `20260427_workspace_sidebar_settings.sql` — исходная таблица (`items` + `board_badges`), RLS, RPC `get_my_task_counts`.
  - `20260427_workspace_sidebar_pinned_boards.sql` — `board_badges` → `pinned_boards`.
  - `20260427_workspace_sidebar_unified_slots.sql` — финальная унификация: `items` + `pinned_boards` → единая колонка `slots`. После применения старых колонок больше нет.

## Подсветка сообщений сотрудников в клиентских чатах

В клиентских тредах сообщения от сотрудников помечаются визуально, чтобы переписка с клиентом легко читалась глазами: **кольцо вокруг аватара** + **левая полоса на бабле** (`border-l-2`, в 2 раза тоньше красной полосы непрочитанного `border-l-4`). Цвет — динамический под акцент чата (`accent_color`), совпадает с цветом «своего» баббла. Красная полоса непрочитанного перебивает «сотрудниковую» (приоритет важнее).

- **«Сотрудник»**: автор сообщения с проектной ролью из `TEAM_ROLES = ['Администратор', 'Владелец', 'Сотрудник', 'Исполнитель']` (см. [`MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx) — `isTeamSender(message.sender_role)`). `sender_role` — это **проектная роль** на момент отправки, хранится в `project_messages.sender_role` (историчность сохраняется при смене ролей).
- **«Клиентский тред»** определяется хуком [`useThreadHasClient`](../../src/hooks/messenger/useThreadHasClient.ts) + сигналами Telegram/Email из `MessengerTabContent`. Тред считается клиентским, если **любое** из:
  1. Тред подключён к Telegram (`telegram_chat_link` на тред) — `state.isLinked`. Покрывает кейс «клиент пишет из Telegram, в сервисе его нет».
  2. Тред подключён к Email (`email_chat_link` на тред) — `state.emailLink`. Аналогично для почты.
  3. Среди `project_participants` проекта есть участник с проектной ролью «Клиент», у которого есть доступ к этому треду:
     - `access_type='all'` → доступ есть у всех участников проекта;
     - `access_type='roles'` → роли клиента пересекаются с `thread.access_roles`;
     - `access_type='custom'` → клиент явно добавлен в `project_thread_members`.
- **Что НЕ работает как сигнал**: `MessageChannel` ('client' | 'internal') в типах сервиса — это легаси-разделение для project_messages, не для тредов. Task-треды по умолчанию идут с `channel='client'`, но клиентскими не являются. Не использовать.
- Флаг пробрасывается через `MessengerContext.isClientThread` → `MessageBubble`. Стили для каждого акцента (`staffBorder` + `staffRing`) — в [`messageStyles.ts`](../../src/components/messenger/utils/messageStyles.ts).

## Личные диалоги (Personal Dialogs)

Реализовано 2026-05-10. **Архитектурный сдвиг** относительно начального дизайна: личные диалоги сотрудника (Telegram Business / Wazzup / личная почта) **больше не лежат внутри фейкового системного проекта**, а живут как треды без `project_id` (NULL) с владельцем `project_threads.owner_user_id`.

- **Модель**: тред личного диалога — `project_threads { project_id = NULL, owner_user_id = <employee>, type ∈ {chat, email}, business_connection_id / wazzup_channel_id / email_account_id }`. Доступ: тред видит только `owner_user_id` + менеджеры воркспейса с `manage_workspace_settings`. Сообщения треда лежат в `project_messages { project_id = NULL, thread_id }`.
- **Удалены** колонки `projects.is_system_business_inbox`, `projects.is_system_wazzup_inbox`, `projects.is_system_email_inbox`, `projects.system_inbox_user_id`, `projects.system_inbox_kind` (миграция `20260510_drop_system_inbox_projects.sql`). RPC `ensure_personal_*_inbox_project` тоже дропнуты — фейковые проекты больше не создаются.
- **Страница**: [`/workspaces/[id]/personal-dialogs`](../../src/app/(app)/workspaces/[workspaceId]/personal-dialogs/page.tsx) — единый UI для всех личных диалогов сотрудника (TG Business + Wazzup + Email). Компонент [`PersonalDialogsPage`](../../src/page-components/PersonalDialogsPage/index.tsx).
- **RPC**: `move_thread_to_project(thread_id, project_id)` — переносит тред из «личных диалогов» в проект и наоборот (NULL = вернуть в личные). RLS-политики тредов проверяют `owner_user_id IS NULL OR owner_user_id = auth.uid()` дополнительно к доступам через `project_participants`.
- **Что НЕ делаем**: не создавать новые системные инбокс-проекты. Если в коде/миграциях встретилась логика «создать проект под личные диалоги» — это устаревший паттерн.

## ⚠️ RLS на `project_threads` — обязательный short-circuit `created_by`

**Правило**: полиция `project_threads_select` ОБЯЗАНА содержать short-circuit `created_by = (SELECT auth.uid())` **до** вызова `can_user_access_thread(id, …)`. Без него ломается **любое** создание треда через REST API.

**Почему**: `can_user_access_thread` определена как `SECURITY DEFINER STABLE` и перечитывает тред: `SELECT … FROM project_threads WHERE id = p_thread_id`. PostgREST по умолчанию шлёт `Prefer: return=representation`, что транслируется в `INSERT…RETURNING *`. К RETURNING-строке Postgres применяет SELECT-полицию. Внутри SECURITY DEFINER функции свежевставленная строка ещё не видна snapshot'у → `NOT FOUND` → `RETURN false` → RLS отбивает INSERT с 42501 «new row violates RLS». PostgreSQL такой нюанс не документирует явно — это эмпирический факт, проверенный инструментованной функцией.

**Правильный шаблон полиции**:

```sql
CREATE POLICY project_threads_select ON public.project_threads FOR SELECT TO public
USING (
  -- Short-circuit: BEFORE INSERT trigger set_thread_created_by всегда выставляет
  -- created_by = auth.uid(), поэтому свежая строка пропускается без вызова функции.
  (created_by = (SELECT auth.uid()))
  OR
  can_user_access_thread(id, (SELECT auth.uid()))
);
```

**История регрессий** (этот баг уже ловили 3 раза):
- `20260404191200_fix_thread_select_policy_inline.sql` — первый фикс.
- `20260426_thread_access_rls.sql` — переписала полицию без short-circuit → сломалось.
- `20260427_fix_thread_select_returning.sql` — восстановила short-circuit.
- `20260510_personal_dialogs_rls.sql` — снова переписала, снова сломалось.
- `20260513083503_fix_thread_select_returning_after_personal_dialogs.sql` — восстановила short-circuit (см. [docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md)).

**При следующем рефакторинге `can_user_access_thread` или `project_threads_select`** — обязательно прогнать тест: `INSERT INTO project_threads (project_id, workspace_id, type, name) VALUES (…) RETURNING id` под role authenticated должен пройти. Полная защита от регрессии — переписать функцию на сигнатуру `can_user_access_thread(t project_threads, p_user_id uuid)` и в полиции вызывать `can_user_access_thread(project_threads, …)` (Postgres подставит значения NEW.* напрямую, без перечитывания таблицы). Тогда short-circuit не нужен. На 2026-05-13 это не сделано — функцию зовут ещё `project_messages_*` полиции и т.п., смена сигнатуры тянет более обширную миграцию.

## Telegram Business (личные диалоги сотрудников)

Реализовано 2026-05-03, перевод на новую модель «без проектов» — 2026-05-10. Архитектура «как у Planfix» — один общий бот сервиса `@clientcase_bot` (id `8669511732`), которого все сотрудники подключают как делегата своего личного TG через **Telegram → Settings → Business → Chatbots**. Требует Telegram Premium у сотрудника. Бот «подсматривает» личные диалоги и тянет их в сервис; ответы из сервиса уходят от имени сотрудника, не бота.

- **Бот**: `@clientcase_bot`, токен в Supabase secrets как `TELEGRAM_BUSINESS_BOT_TOKEN`. В BotFather у бота включён **Business Mode**.
- **Webhook**: [`telegram-business-webhook`](../../supabase/functions/telegram-business-webhook/index.ts), деплой `--no-verify-jwt`. Защита — заголовок `X-Telegram-Bot-Api-Secret-Token`, значение в `TELEGRAM_BUSINESS_WEBHOOK_SECRET`. Слушает: `message` (`/start biz_<token>`), `business_connection`, `business_message`, `edited_business_message`, `deleted_business_messages`.
- **Двухшаговое подключение**:
  1. UI «Telegram Business» → фронт вызывает [`telegram-business-link-init`](../../supabase/functions/telegram-business-link-init/index.ts) → deep-link `t.me/clientcase_bot?start=biz_<uuid>`. TTL токена — 30 мин.
  2. Сотрудник кликает, жмёт START → webhook пишет связку в `user_telegram_links (user_id ↔ tg_user_id)`. Один TG-аккаунт = один user_id (UNIQUE).
  3. Сотрудник в Telegram → Settings → Business → Chatbots добавляет `@clientcase_bot` с правом «Reply to messages» → прилетает `business_connection` → webhook создаёт запись в `telegram_business_connections`.
- **Хранение диалогов**: тред с `project_id = NULL`, `owner_user_id = <employee>`, `business_connection_id`, `business_client_tg_user_id` (UNIQUE пара). Создаётся автоматически при первом сообщении. Раньше лежал в системном проекте — теперь без проекта.
- **Скрытие из общих списков**: тред с `project_id=NULL` фильтруется из обычных списков проектов/тредов на уровне RPC (`pt.project_id IS NOT NULL` либо явное условие на personal-dialogs UI).
- **Таблицы и миграции**:
  - `telegram_business_connections (id, workspace_id, user_id, business_connection_id UNIQUE, tg_user_id, tg_username, tg_first_name, tg_last_name, is_enabled, can_reply, connected_at, disconnected_at)` — миграция `20260503_telegram_business.sql`.
  - `user_telegram_links (user_id PK, tg_user_id UNIQUE, ...)` — миграция `20260503_user_telegram_links.sql`.
  - `telegram_business_link_tokens (token, user_id, workspace_id, expires_at, consumed_at)` — одноразовые токены шага 1.
  - `project_threads.business_connection_id` + `business_client_tg_user_id` + `owner_user_id` — миграции `20260503_telegram_business.sql` и `20260510_thread_owner_user_id.sql`.
- **RLS**: `telegram_business_connections` — сам сотрудник видит свои + менеджеры воркспейса с `manage_workspace_settings` видят все в своём WS. `user_telegram_links` — аналогично. `telegram_business_link_tokens` — только владелец токена. INSERT/UPDATE/DELETE везде — service role.
- **Источник в сообщениях**: `project_messages.source = 'telegram_business'` (новое значение, в дополнение к `telegram`/`email`/`web`). `telegram_chat_id` хранит id личного чата клиента, `telegram_sender_user_id` — реальный отправитель.
- **Отправка ответов из сервиса**: Edge Function [`telegram-business-send`](../../supabase/functions/telegram-business-send/index.ts). PG-триггер `notify_telegram_on_new_message` маршрутизирует туда сообщения, у тредов которых заполнен `business_connection_id`. Поддерживается `reply_parameters` (цитата). Контент конвертируется через общий `_shared/htmlFormatting.ts`. После отправки стампится `telegram_chat_id` (равен `tg_user_id` клиента в личке) и `telegram_message_id` — без этого реакции/реплаи не привязываются.
- **Реплаи**: работают в обе стороны через общий хелпер `_shared/syncTelegramIncomingMessage.ts` — он ищет оригинал по `telegram_message_id` в треде и проставляет `reply_to_message_id`. На отправке `telegram-business-send` передаёт `reply_parameters`.
- **Ограничение Telegram (реакции)**: реакции в Telegram Business **не поддерживаются Bot API в принципе** — это не наш баг, а ограничение платформы:
  - `setMessageReaction` не имеет параметра `business_connection_id` (см. [Bot API changelog](https://core.telegram.org/bots/api-changelog) — параметр добавляли к sendMessage/editMessage/pinMessage, но не к реакциям).
  - Webhook `message_reaction` не приходит для личных чатов: Telegram требует, чтобы бот был **админом чата**, а в 1-на-1 чатах админов нет.
  - Альтернативы из Bot API нет — реакции «от имени пользователя» ставятся только через клиентский MTProto (`messages.sendReaction`), что выходит за рамки Bot API.
  - Поэтому реакции, поставленные сотрудником в сервисе на business-сообщения, **остаются только в сервисе** — фронт `messengerReactionService.ts` пропускает вызов `telegram-set-reaction` для `source = 'telegram_business'`. В обычных групповых чатах (через секретаря) реакции работают штатно.
- **Общие хелперы**: бизнес-webhook максимально переиспользует код group-webhook'а:
  - `_shared/syncTelegramIncomingMessage.ts` — дедуп, reply-lookup, инсёрт. Параметры `source` и `senderRole` позволяют различать обычный TG и Business.
  - `_shared/syncTelegramReactions.ts` — общая обработка `message_reaction` updates (используется group-webhook'ом v1+v2; для business не вызывается, но если в будущем Telegram включит реакции — webhook готов).
  - `_shared/htmlFormatting.ts` — HTML→Telegram-HTML при отправке.
- **TODO**: отдельный UI «Мои личные диалоги Telegram» (сейчас системный инбокс показывается обычным проектом), вложения (фото/файлы) в business-сообщениях.

## Wazzup (WhatsApp / Instagram через шлюз)

Реализовано 2026-05-03 (MVP-каркас). Архитектура «как у Telegram Business» — один общий API-ключ Wazzup на воркспейс, каналы (= номера WhatsApp / IG-аккаунты) привязываются к сотрудникам, личные диалоги клиента кладутся в системный проект-инбокс этого сотрудника.

- **Шлюз**: Wazzup24 (https://wazzup24.com). Платный. Технически — обёртка над WhatsApp Web (через QR-код), Instagram, Telegram, etc. ToS WhatsApp формально нарушает, но коммерческий риск принимает Wazzup, не мы. Альтернативы: Green API, Chat API, Whapi.
- **Один API-ключ на воркспейс** — хранится в `wazzup_settings.api_key`. Менеджеры воркспейса могут его сохранить через UI. На сотрудника — по одному (или нескольким) каналам через `wazzup_channels.user_id`.
- **Webhook**: [`wazzup-webhook`](../../supabase/functions/wazzup-webhook/index.ts), деплой `--no-verify-jwt`. Защита — секрет в query-string URL'а (`?key=<webhook_secret>`), потому что Wazzup **не поддерживает custom-headers для webhooks**. Секрет генерируется при создании `wazzup_settings` (24 байта hex).
- **Подписка webhook через API**: Wazzup **не позволяет** настроить webhook через UI кабинета — только через `PATCH https://api.wazzup24.com/v3/webhooks` с `{webhooksUri, subscriptions: {messagesAndStatuses, channelsUpdates}}`. Делает это [`wazzup-set-webhook`](../../supabase/functions/wazzup-set-webhook/index.ts) — кнопка «Подписать webhook» в UI вызывает эту функцию.
- **Подписки**: `messagesAndStatuses` + `channelsUpdates`. Webhook парсит три типа payload'ов: `messages[]`, `statuses[]`, `channelsUpdates[]`, плюс тестовый `{test:true}`.
- **Отправка**: [`wazzup-send`](../../supabase/functions/wazzup-send/index.ts), вызывается pg-триггером `notify_telegram_on_new_message` (4-я ветка после MTProto/Business/Group). REST: `POST https://api.wazzup24.com/v3/message` с `Authorization: Bearer <api_key>`, payload `{channelId, chatType, chatId, text}`. Сейчас MVP — только текст (HTML из tiptap → plain через `stripHtml`). Файлы, реакции, голосовые — отдельной итерацией.
- **Загрузка каналов**: [`wazzup-fetch-channels`](../../supabase/functions/wazzup-fetch-channels/index.ts) — ходит `GET /v3/channels` с API-ключом и upsert'ит в `wazzup_channels`. Вызывается из UI кнопкой «Загрузить из Wazzup». Деплой обычный (с JWT) — функция проверяет, что вызывающий = менеджер воркспейса.
- **Хранение треда**: тред `project_id=NULL`, `owner_user_id=<employee>`, `wazzup_channel_id`, `wazzup_chat_id`. Раньше лежал в системном проекте `is_system_wazzup_inbox`, с 2026-05-10 — без проекта (см. раздел «Личные диалоги»).
- **Тред**: один на клиента в рамках канала. Поля `project_threads.wazzup_channel_id` (наш FK на `wazzup_channels.id`) + `wazzup_chat_id` (id чата в Wazzup — телефон без `+` для WA, username для IG). UNIQUE на пару + `is_deleted=false`.
- **Сообщение**: `project_messages.source = 'wazzup'`, `wazzup_message_id` (UNIQUE для дедупа), `wazzup_status` (sent/delivered/read/error — обновляется webhook'ом по событиям `statuses[]`). `isEcho=true` от Wazzup — это сообщение, отправленное сотрудником с телефона; webhook привязывает его к participant'у сотрудника, sender_role='Сотрудник'.
- **Миграции**: `20260503_wazzup_integration.sql` (таблицы + поля + RLS), `20260503_notify_wazzup_branch.sql` (расширение триггера на ветку Wazzup, плюс пропуск source='wazzup' от циклов).
- **UI**: вкладка «WhatsApp (Wazzup)» в `IntegrationsTab` ([`WazzupSection.tsx`](../../src/page-components/workspace-settings/WazzupSection.tsx)). Шаги: ввести API-ключ → скопировать webhook URL в кабинет Wazzup → загрузить каналы → назначить каналы на сотрудников.
- **Хуки**: [`useWazzup.ts`](../../src/hooks/useWazzup.ts) — `useWazzupSettings`, `useUpsertWazzupSettings`, `useWazzupChannels`, `useFetchWazzupChannels`, `useSetWazzupWebhook`, `useAssignWazzupChannelUser`, `buildWazzupWebhookUrl`.
- **RLS-правки** (миграция `wazzup_rls_write_policies`): помимо SELECT-полиси менеджерам разрешены ALL на `wazzup_settings` (чтобы фронт мог `upsert` ключ) и UPDATE на `wazzup_channels` (чтобы привязывать каналы к сотрудникам через UI).
- **Env-переменная**: `INTERNAL_FUNCTION_SECRET` (тот же, что у telegram-*-send) — триггер шлёт его в `wazzup-send` как `x-internal-secret`.
- **Деплой каркаса**:
  ```bash
  # 1. Применить миграции
  supabase db push --project-ref zjatohckcpiqmxkmfxbs
  # 2. Edge functions
  supabase functions deploy wazzup-webhook --no-verify-jwt --project-ref zjatohckcpiqmxkmfxbs
  supabase functions deploy wazzup-send --no-verify-jwt --project-ref zjatohckcpiqmxkmfxbs
  supabase functions deploy wazzup-fetch-channels --project-ref zjatohckcpiqmxkmfxbs
  # 3. Регенерация типов БД (новые таблицы)
  supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts
  ```
- **Вложения (приём)**: webhook v2 при `type ∈ {image,video,audio,voice,document,sticker}` скачивает `contentUri`, кладёт в Storage `files/<workspace>/<project>/<message>/<file>`, создаёт строки в `files` + `message_attachments`, ставит `has_attachments=true`.
- **Вложения (отправка)**: `wazzup-send` v2 при `has_attachments=true` для каждого `message_attachments` создаёт signed URL (1 час) и шлёт `POST /v3/message` с `contentUri`. У первого файла добавляет `text` как caption и `quotedMessageId` (если reply). Триггер БД пропускает сообщения с `has_attachments=true` — фронт сам инициирует через `supabase.functions.invoke('wazzup-send', { body: { message_id, attachments_only: true } })` (см. блок в `messengerService.ts`).
- **Голосовые транскрипция**: webhook после загрузки voice/audio fire-and-forget'ом дёргает существующую `transcribe-audio` функцию, она пишет в `message_attachments.transcription`.
- **Reply при отправке**: `wazzup-send` ищет `wazzup_message_id` оригинала по `reply_to_message_id` и передаёт в `quotedMessageId`.
- **Mark as read**: [`wazzup-mark-read`](../../supabase/functions/wazzup-mark-read/index.ts) → `POST /v3/markread`. Дёргается фронтом из [`useWazzupMarkRead`](../../src/hooks/messenger/useWazzupMarkRead.ts) при открытии Wazzup-треда (в `useMessengerState`).
- **Read-receipts от клиента**: webhook v2 при `status='read'` обновляет не только `wazzup_status`, но и `recipient_read_at` — UI рисует синие галочки.
- **Галочки доставки в UI**: [`WazzupDeliveryIndicator.tsx`](../../src/components/messenger/WazzupDeliveryIndicator.tsx) — `pending → sent → delivered → read → failed`. Подключён в `MessageBubble.tsx` через расширенный `getDeliveryStatus`.
- **Имена клиентов**: webhook берёт `contact.name → authorName → username → phone → chatId`, при первом сообщении создаёт тред с реальным именем; если тред уже существовал с именем-телефоном-fallback, апдейтит `name`.
- **Привязка треда к проекту**: RPC [`move_thread_to_project(thread_id, project_id)`](../../supabase/migrations/20260503_move_thread_to_project_rpc.sql) меняет `project_id` у треда + всех его сообщений (один воркспейс). Хук [`useMoveThreadToProject`](../../src/hooks/messenger/useMoveThreadToProject.ts). UI-точка пока не интегрирована — вызов из дев-консоли работает.
- **Wazzup в UI**: после ухода от системных проектов (2026-05-10) Wazzup-треды видны в [`/workspaces/[id]/personal-dialogs`](../../src/app/(app)/workspaces/[workspaceId]/personal-dialogs/page.tsx). Атрибуция треда сотруднику — по `project_threads.owner_user_id`.

### Известные ограничения / не делается

- **Реакции в обе стороны**: WhatsApp Business / Wazzup не отдают reactions как отдельный webhook-event и не дают их ставить через API. Реакция клиента (как видели на тесте) приходит как обычное сообщение с эмодзи в ответ.
- **Edit/delete сообщений**: Wazzup webhook схема для этого не документирована; пропускаем.

## ⚠️ Дедуп между несколькими ботами в одной Telegram-группе

Если в одной Telegram-группе сидят 2+ бота воркспейса (`telegram_workspace_bot` + `telegram_employee_bot`'ы), при включённом privacy mode Telegram присваивает **каждому боту свой message_id** для одного и того же сообщения клиента — у каждого бота свой локальный счётчик. То есть на одно реальное сообщение наш `/telegram-webhook` получает 2-3 разных update'а с разными `message.message_id`, но с одинаковым `chat.id`, `from.id`, `date`, `text`.

UNIQUE `uq_telegram_message_per_chat (telegram_chat_id, telegram_message_id)` тут **не помогает** — id разные. Дедуп обеспечивает второй UNIQUE: `uq_project_messages_telegram_content_dedup (telegram_chat_id, telegram_sender_user_id, telegram_message_date, md5(content)) WHERE source='telegram'`. Первый webhook записывает сообщение, второй и третий получают 23505 и обрабатываются как `outcome='duplicate'` в `_shared/syncTelegramIncomingMessage.ts`.

**Edge case**: если один и тот же клиент шлёт абсолютно идентичный текст в одну и ту же секунду — второе сообщение будет дедуплено (потеря). На практике не встречается. Если когда-нибудь понадобится — переключить ключ на `(... , telegram_message_id_of_first_bot)` или хранить `bot_received_at` с миллисекундами.

**При добавлении нового типа Telegram-интеграции, которая слушает webhook'и** (`telegram_*_bot`), не предполагать, что message_id уникален на сообщение — это верно только в пределах одного бота. Полагаться на content-based dedup.

См. подробный разбор: [docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md).

## Аватары собеседников во «Входящих»

Реализовано 2026-05-10. В списке тредов аватар = клиент (собеседник), а не последний отправитель. Логика и инфраструктура подтягивания внешних аватаров — здесь.

- **Резолв в RPC** [`get_inbox_threads_v2`](../../supabase/migrations/20260510_inbox_v2_counterpart_avatar.sql) возвращает `counterpart_name` + `counterpart_avatar_url`. Приоритет источников:
  1. `participants.avatar_url` — если у клиента есть participant (TG group / MTProto после обогащения / web).
  2. `telegram_user_avatars.avatar_url` — для TG Business (`business_client_tg_user_id`), TG MTProto (`mtproto_client_tg_user_id`), TG group (по `telegram_sender_user_id` последнего клиентского сообщения).
  3. `project_threads.wazzup_contact_avatar_url` — для Wazzup-тредов.
  4. NULL → UI рисует инициал `counterpart_name`.
- **Кэш TG**: таблица `telegram_user_avatars (tg_user_id PK, avatar_url, is_missing, fetched_at)`. TTL для hit — 30 дней, для miss — 7 дней. RLS: SELECT всем authenticated, write — только service_role.
- **Edge Function `fetch-telegram-avatar`**: принимает `{tg_user_id, force?}`, через Bot API (`getUserProfilePhotos` + `getFile`) скачивает фото и кладёт в Storage `participant-avatars/tg/<tg_user_id>.jpg`. Дедупит по кэшу. Auth: x-internal-secret или Bearer JWT. Деплой `--no-verify-jwt`. **Не работает для MTProto-юзеров** — Bot API не «видит» их (возвращает `Bad Request: user not found`).
- **MTProto-аватары** (отдельный путь): эндпоинт `POST /users/fetch-avatar` в [`mtproto-service/src/routes/commands.ts`](../../mtproto-service/src/routes/commands.ts) через gramjs `client.downloadProfilePhoto` → Storage → пишет в `participants.avatar_url`. Также автоматически вызывается из [`handleNewMessage`](../../mtproto-service/src/handlers/incoming.ts) при каждом входящем сообщении (fire-and-forget, идемпотентно — пропускается если participant уже имеет avatar_url).
- **MTProto backfill истории** (реализовано 2026-05-12): когда сотрудник долистал MTProto-тред до самого старого сообщения в БД, в [`MessageList.tsx`](../../src/components/messenger/MessageList.tsx) показывается кнопка «Загрузить ещё 50 из Telegram». Цепочка: фронт зовёт [`telegram-mtproto-backfill`](../../supabase/functions/telegram-mtproto-backfill/index.ts) (edge function проверяет JWT + членство в воркспейсе треда) → mtproto-service `POST /messages/backfill` → `client.invoke(Api.messages.GetHistory)` с `offset_id = min(telegram_message_id треда)` и `limit=50` → каждое сообщение через общий хелпер `ingestMtprotoMessage` (вынесен из `handleNewMessage` и переиспользуется и в realtime, и в бэкфилле) → инсёрт в `project_messages` + скачивание медиа. Идемпотентно через UNIQUE (thread_id, telegram_message_id, source). **Rate-limit**: per-session throttle 2 сек между запросами (`backfillLastCall` в [`commands.ts`](../../mtproto-service/src/routes/commands.ts)). FLOOD_WAIT exception → 429 с `Retry-After`, фронт показывает «попробуйте через N сек» через toast. UI-флаг — `useIsMtprotoThread` в [`useBackfillTelegramHistory.ts`](../../src/hooks/messenger/useBackfillTelegramHistory.ts), запрос мутации — `useBackfillTelegramHistory`. Кнопка показывается только при `hasMoreOlder === false` (БД исчерпана) и треде с заполненными `mtproto_session_user_id`/`mtproto_client_tg_user_id`.
- **Wazzup-аватары**: webhook сохраняет `msg.contact.avatarUri` в `project_threads.wazzup_contact_avatar_url` (только для входящих, не для echo сотрудника). URL у Wazzup публичный.
- **Hooks в webhook'ах**: TG group ([`telegram-webhook-v2`](../../supabase/functions/telegram-webhook-v2/index.ts)) и TG business ([`telegram-business-webhook`](../../supabase/functions/telegram-business-webhook/index.ts)) после `syncTelegramIncomingMessage` дёргают `fetch-telegram-avatar` fire-and-forget — для Business это критичный момент, потому что вне активного коннекта `getUserProfilePhotos` отбивает «user not found».
- **Image hostnames** (`next.config.ts`): разрешены `*.wazzup24.com`, `pps.whatsapp.net` плюс существующие `*.googleusercontent.com` и Supabase Storage.
- **Email**: gravatar не используется — большинство адресов без gravatar, домен пришлось бы добавлять в `next.config.ts`, и `?d=404` ломает `next/image`. Для email-тредов остаётся инициал по `contact_email`.
- **Миграции**: `20260510_client_avatars_infra.sql` (таблица + колонка), `20260510_inbox_v2_counterpart_avatar.sql` (расширение RPC).
- **Backfill**: при сбое сессии MTProto или непрогретом Bot API — записи остаются с `is_missing=true` до следующего сообщения. После рестарта mtproto-сервиса аватары начинают подтягиваться автоматически при первом же сообщении в треде.

## Мессенджер-каналы — единая справка

### Матрица возможностей

| Возможность                       | TG group | TG Business | TG MTProto | Wazzup (WA) | Email |
|-----------------------------------|----------|-------------|------------|-------------|-------|
| Текст в обе стороны               | ✅       | ✅          | ✅         | ✅          | ✅    |
| Вложения (приём)                  | ✅       | ✅          | ✅         | ✅          | ✅    |
| Вложения (отправка)               | ✅       | частично    | частично   | ✅          | ✅    |
| Reply-цитирование (приём)         | ✅       | ✅          | ✅         | ✅          | n/a   |
| Reply-цитирование (отправка)      | ✅       | ✅          | ✅         | 🟡 fallback в текст | n/a   |
| Reactions (приём)                 | ✅       | 🟡 как сообщение | ✅      | 🟡 как сообщение | ❌ |
| Reactions (отправка)              | 🟡 если бот админ | 🟡 reply-эмодзи | ✅ native | 🟡 reply-эмодзи | ❌ |
| Edit/Delete своих исходящих       | ✅       | ✅          | ✅         | ❌          | ❌    |
| Read-receipts (от клиента)        | ❌       | ❌          | ✅ MTProto | ✅          | 🟡 пиксель |
| Mark-as-read (мы → внешний)       | ❌       | ❌          | ✅         | ✅          | n/a   |
| Голосовые с автотранскрипцией     | ✅       | ✅          | ✅         | ✅          | n/a   |

Легенда: ✅ — нативно, 🟡 — эмуляция/частично, ❌ — не поддерживается каналом.

### Edge Functions — общий слой

[`supabase/functions/_shared/edge.ts`](../../supabase/functions/_shared/edge.ts) — единые helpers:
`corsHeadersFor(req)` (динамический CORS-whitelist), `corsHeaders` (статический wildcard, **@deprecated**), `preflight(req?)`, `jsonRes(payload, status, req?)`, `okText()`,
`requireInternalSecret(req, allowBearer?)`, `getServiceClient()`,
`getUserClient(req)`, `getUser(req)`. Всем новым функциям использовать с `req` — это даёт правильный Origin-whitelist из [`_shared/cors.ts`](../../supabase/functions/_shared/cors.ts) (clientcase.app + поддомены + env ALLOWED_ORIGINS). Без `req` остаётся wildcard для back-compat со старыми функциями.

### Распил telegram-webhook-v2 (2026-05-11)

[`supabase/functions/telegram-webhook-v2/`](../../supabase/functions/telegram-webhook-v2/) — главный групповой бот @rs2_support_bot. Раньше был монолитом 2227 строк. После распила:

| Модуль | ~Строк | Что |
|--------|--------|-----|
| `index.ts` | 96 | Entry: auth (читает токен из `workspace_integrations`) + маршрутизация update → handler |
| `shared.ts` | 31 | `service`, `getBotToken()/setBotToken()`, `SUPABASE_URL/KEY`. Токен бота — getter/setter (изначально пустой, `setBotToken()` в entry на каждом запросе) |
| `types.ts` | 106 | Типы Telegram API + `TgChatBinding`, `TgFileDescriptor`, `BotSession` |
| `pure.ts` | 181 | Чистые helpers — форматирование, парсинг, без зависимостей |
| `tg-api.ts` | 68 | `sendMessage`, `editMessage`, `answerCallback`, `tgCall` |
| `bindings.ts` | 20 | `findChatBinding(chat_id)` |
| `participants.ts` | 64 | `participantByTgId`, `findOrCreateParticipant` |
| `media.ts` | 81 | `fetchTelegramFile`, `downloadAttachments` |
| `session.ts` | 49 | `telegram_bot_sessions` CRUD (многошаговые сценарии) |
| `knowledge.ts` | 279 | База знаний: `showKbGroups`, `showArticle`, `resolvePrefixId`, `logServiceEvent` |
| `commands.ts` | 271 | `/start`, `/menu`, `/link`, `/unlink`, `showMainMenu`, `showFolderInfo` |
| `upload-slot.ts` | 875 | Загрузка документов: `showUploadSlots`, `showUploadFolderSlots`, `showDocStatus`, `showFolderArticle`, `onSlotSelected`, `onFreeUploadSelected`, `uploadDocumentCore`, `handleSlotFileUpload`, `handleFreeFileUpload` |
| `callbacks.ts` | 111 | `handleCallback` — маршрутизатор inline-кнопок |
| `sync.ts` | 159 | `handleMessage`, `syncGroupMessage`, `handlePrivateMessage` |
| `callback-data.ts` | 120 | Кодирование/декодирование `callback_data` (короткий формат для 64-байтового лимита Telegram) |
| `tiptap.ts` | 186 | Рендер статей `knowledge_articles` в Telegram-HTML с разбиением на чанки 4096 |

При добавлении новых команд/сценариев: команды → `commands.ts`, callback кнопок → `callbacks.ts`, новые экраны загрузок → `upload-slot.ts`. Если новая функция нужна в нескольких файлах — `pure.ts` или соответствующий тематический модуль.

### Авторизация Edge Functions — матрица

| Функция                    | verify_jwt | x-internal-secret | Bearer JWT | Кто вызывает |
|----------------------------|------------|-------------------|------------|--------------|
| `*-webhook` (TG, Wazzup)   | false      | —                 | —          | Сторонний сервис, защита через secret в URL/header |
| `*-send` (TG group, Business, Wazzup) | false | да | да (фронт)| pg-триггер `notify_telegram_on_new_message` + фронт (для attachments_only) |
| `wazzup-mark-read` / `wazzup-fetch-channels` / `wazzup-set-webhook` / `*-react` (Business/MTProto) | true | — | да | Только фронт (RLS внутри) |
| `wazzup-send-reaction`     | true       | —                 | да         | Фронт |

### Чек-лист «Как добавить новый мессенджер»

1. **БД (миграция)**:
   - `<channel>_settings` (workspace_id, api_key, webhook_secret) + RLS только для менеджеров
   - `<channel>_channels` (привязка к user_id) + RLS
   - Поля в `project_threads`: `<channel>_channel_id`, `<channel>_chat_id` + partial UNIQUE
   - Поля в `project_messages`: `<channel>_message_id` (UNIQUE) + `<channel>_status` если нужны статусы
   - Расширить enum `message_source` через `ALTER TYPE message_source ADD VALUE 'newchan'`
   - Добавить ветку в триггер `notify_telegram_on_new_message` (skip 'newchan' source + блок маршрутизации)
   - Добавить флаг системного инбокса в `projects` (или использовать `system_inbox_kind` после Зоны 4)
2. **Edge Functions**:
   - `<channel>-webhook` — приём входящих, с защитой query-param/header secret
   - `<channel>-send` — отправка через REST канала; auth через x-internal-secret + Bearer
   - При необходимости: `<channel>-mark-read`, `<channel>-send-reaction`, `<channel>-fetch-channels`
   - Все на helpers из `_shared/edge.ts`
3. **Фронт**:
   - Хук `use<Channel>Settings` / `use<Channel>Channels`
   - Секция в `IntegrationsTab` (трёх-шаговый онбординг по аналогии с WazzupSection)
   - Расширить `ProjectMessage.source` enum
   - Добавить ветку в `useDeliveryStatus` (если нужны индикаторы доставки)
   - Добавить стратегию в `reactionStrategies.toggleReactionByChannel`
   - Если есть mark-as-read API — добавить хук `use<Channel>MarkRead` и подключить в `useMessengerState`
   - Расширить `useProjectData` для нового системного инбокса
   - Расширить фильтр `useSidebarData` — скрыть чужой инбокс
4. **Иконка/цвет тредов**: добавить в `THREAD_ICONS` (если нужна бренд-иконка) и в дефолтах создания тредов внутри webhook.
5. **Документация**: обновить эту матрицу + добавить раздел канала в infrastructure.md.

## Блокировка участника (`participants.can_login`)

Реализовано 2026-05-13. Раньше `can_login` был чисто внутренним UI-флагом — Supabase Auth-логин не блокировался, активные сессии не сбрасывались, заблокированный сотрудник продолжал работать через старый refresh-token. Теперь — единый пайплайн через Edge Function.

- **Edge Function `set-participant-access`** (verify_jwt=true): принимает `{ participant_id, can_login }`. Проверяет права через `is_workspace_owner` или `has_workspace_permission(..., 'manage_workspace_settings')`. Запрещает блокировать владельца воркспейса и самого себя. После UPDATE `participants.can_login`:
  - **Блокировка**: если у юзера НЕТ других активных participants (`can_login=true AND is_deleted=false` в других WS) → банит через `auth.admin.updateUserById({ ban_duration: '876000h' })` (~100 лет). В любом случае дёргает RPC `revoke_all_user_sessions(user_id)` — это убивает все его `auth.sessions` и `auth.refresh_tokens`. Текущий access-token живёт ещё до часа, но server-side guard в `[workspaceId]/layout.tsx` отрежет ему доступ.
  - **Разблокировка**: `auth.admin.updateUserById({ ban_duration: 'none' })`.
- **RPC `revoke_all_user_sessions(uuid)`** — `SECURITY DEFINER`, GRANT только service_role. `DELETE FROM auth.sessions/auth.refresh_tokens` для юзера. `auth.admin.signOut(jwt)` нам не подходит — он требует access-token самого юзера.
- **Server-side guard**: `src/app/(app)/workspaces/[workspaceId]/layout.tsx` — server component. На каждом server-render запросе проверяет `participants.can_login` и `is_deleted` для текущего user_id в этом workspace. При отказе — `redirect('/workspaces?blocked=<id>')`. Клиентскую обёртку (`WorkspaceProvider` + `WorkspaceLayoutShell`) выделили в `WorkspaceLayoutClient.tsx`.
- **Frontend**: `toggleAccessMutation` и `editMutation` в `useParticipantsMutations.ts` ходят через `supabase.functions.invoke('set-participant-access', ...)`. Прямой UPDATE `participants.can_login` с фронта в этой логике больше не используется (RLS-полиция остаётся, она нужна другим сценариям, но через UI флаг меняется только функцией).
- **Миграция**: `20260513_revoke_user_sessions.sql`.
- **Известные ограничения**: пока выставлен бан, активный access-token юзера ещё валиден до его естественного истечения (≤1ч). Server-side guard layout'а закрывает доступ к UI воркспейса, но если у юзера остался открытым прямой URL внутри проекта — сервер-рендер всё равно дёрнет редирект (layout вызывается до children). Прямые fetch'и к Supabase под истекающим JWT отработают только для public-данных.

## Импersonация — «войти под пользователем» (read-only)

Реализовано 2026-05-08. Владелец воркспейса может временно «увидеть глазами» любого активного сотрудника — задачи, чаты, сайдбар, доступы. Режим строго для просмотра: любые DML-операции блокируются на уровне БД.

- **Кому доступно**: только участникам с ролью `Владелец` в воркспейсе. Запрещено: импersonировать самого себя; импersonировать другого `Владельца`; стартовать импersonацию из уже импersonированной сессии.
- **TTL**: 30 минут. По истечению JWT баннер автоматически возвращает оригинальную сессию.
- **Архитектура**: Edge Function `impersonate-start` подписывает кастомный JWT (HS256, секрет = `JWT_SIGNING_SECRET`) с claim `app_metadata.impersonated_by = owner_id`. Фронт меняет сессию через `supabase.auth.setSession({ access_token, refresh_token: '' })` и перезагружает страницу. Оригинальная сессия владельца бэкапится в `localStorage` под ключом `cc_impersonation_original_session_v1` и восстанавливается при выходе.
- **Защита от записи** — БД-триггер `prevent_impersonation_writes` повешен на ВСЕ public-таблицы (кроме самой `impersonation_sessions`). Триггер проверяет `public.is_impersonating()` (читает claim из JWT). При импersonации — `RAISE EXCEPTION`. Service-role и pg_cron проходят свободно (у них в JWT нет нашего claim'а).
- **Фронт**: глобальный обработчик `MutationCache.onError` ловит ошибку триггера по тексту `Impersonation mode is read-only` и показывает дружелюбный toast «В режиме просмотра изменения недоступны».
- **UI**:
  - Кнопка «Войти под пользователем» — в меню участника на `/workspaces/[id]/settings/participants` ([`ParticipantMenu.tsx`](../../src/page-components/workspace-settings/components/ParticipantMenu.tsx)). Виден только владельцу, только у активных участников с привязанным `user_id`, не-владельцев.
  - Sticky-баннер сверху на всех приватных роутах — [`ImpersonationBanner.tsx`](../../src/components/impersonation/ImpersonationBanner.tsx). Показывает email просматриваемого юзера, таймер до истечения, кнопку «Выйти из режима».
- **Таблица аудита**: `impersonation_sessions (id, owner_user_id, target_user_id, workspace_id, jti, started_at, ended_at, expires_at, user_agent, ip)`. SELECT — только владелец и сам импersонированный (если активна). INSERT/UPDATE — только service role через RPC.
- **RPC**:
  - `start_impersonation_session(owner_user_id, workspace_id, target_user_id, jti, expires_at, user_agent, ip)` — SECURITY DEFINER, доступна только service_role. Делает все проверки прав.
  - `end_impersonation_session(session_id)` — SECURITY DEFINER, доступна authenticated. Может закрыть владелец (из своей сессии) или сам target (из импersonationного JWT).
- **Helper-функции**: `public.is_impersonating()`, `public.impersonating_owner_id()`, `public.is_workspace_owner(user, workspace)`.
- **Edge Functions**:
  - `impersonate-start` — `--no-verify-jwt` (внутри сами читаем Authorization Bearer; verify=false снимает требование Supabase-шлюза, чтобы не било 401 до нашего кода). Требует env-переменную `JWT_SIGNING_SECRET` (тот же HS256 секрет, что и у GoTrue — берётся из Project Settings → API → JWT Secret).
  - `impersonate-end` — обычный (`verify_jwt=true`).
- **Миграции**: `20260507_impersonation.sql` (таблица + helpers + RPC + триггер на все public-таблицы).
- **Хук**: [`useImpersonation`](../../src/hooks/useImpersonation.ts) — состояние читается из JWT текущей сессии, действия `start({ workspace_id, target_user_id })` и `end()`.
- **Что нужно сделать руками** (если включаешь впервые на новом проекте): задать секрет `JWT_SIGNING_SECRET` в Supabase Edge Functions secrets — `supabase secrets set JWT_SIGNING_SECRET=<значение из Dashboard>`. Без него `impersonate-start` вернёт 500.
- **Известные ограничения**:
  - Реалтайм-подписки переподключаются при `setSession`, но в момент полного reload фронта на короткое время теряются — терпимо.
  - Если импersonationный JWT истёк, а пользователь успел сделать действие — увидит ошибку аутентификации; баннер должен был успеть авто-выйти раньше.

## Фильтры — общий примитив

Реализован 2026-05-10. Фильтр тредов и проектов — общий формат и общий движок,
используется и колонками досок (`board_lists.filters`), и списками
(`item_lists.filter_config`).

- **Типы и движок**: [`src/lib/filters/`](../../src/lib/filters/).
  - `types.ts` — `FilterCondition`, `FilterGroup`, `FilterRule`, `FilterFieldDef`, `FilterContext`, `OPERATOR_LABELS`, `SortField`, `SortDir`, `EMPTY_FILTER_GROUP`, `mergeFilterGroupsAnd`, `ThreadType`.
  - `filterEngine.ts` — `applyFilters(items, group, ctx, fieldAccessors, junctionAccessors)`. Чистая функция, поддерживает рекурсивные AND/OR, динамические даты (`__today__`, `__last_n_days:7__` и т.п.), резолв `__me__` / `__creator__`.
  - `filterDefinitions.ts` — `THREAD_FILTER_FIELDS` и `PROJECT_FILTER_FIELDS`. У каждого поля для тредов есть `applicableTypes: ThreadType[]` (`task`/`chat`/`email`).
  - `fieldVisibility.ts` — `getApplicableThreadTypes(group)` и `filterFieldsByThreadTypes(fields, types)`. Когда в фильтре есть условие на поле `type` (equals/in/not_in), UI сужает список доступных полей под выбранные типы.
- **UI-редактор**: [`src/components/filters/`](../../src/components/filters/) — `FilterGroupEditor`, `FilterRuleRow`, `FilterValueSelect`, `FilterDateValue`, `FilterDragOverlay`, `DraggableFilterRule`. Корневой компонент оборачивает дочерние в `FilterRootGroupContext` — это позволяет дочерним строкам читать корневую группу для умной видимости полей.
- **`entity_type='thread'`** — единое имя для тредов в фильтре. Соответствует `project_threads`, у которого собственное поле `type ∈ {task, chat, email}`. Раньше у досок было `entity_type='task'` — миграция `20260510_rename_task_to_thread_in_board_lists.sql` переименовала и в `board_lists.entity_type`, и в JSONB-ключе `boards.global_filter`.
- **`entity_type='inbox'`** — спец-кейс только у `board_lists` (входящие чаты с собственной логикой `default_filter`); фильтр-движок к нему не применяется.

## Списки `item_lists` (треды и проекты в табличном виде)

Реализовано 2026-05-10. Альтернатива доскам: **доска** даёт несколько подсписков
рядом (kanban-режим), **list** — одна выборка по фильтру с табличным
представлением, чекбоксами и пакетными действиями.

- **Таблица**: `item_lists (id, workspace_id, owner_user_id, entity_type, name, icon, color, filter_config jsonb, sort_by, sort_dir, columns jsonb, created_by, created_at, updated_at, is_deleted, deleted_at, deleted_by)`.
- **owner_user_id**:
  - `NULL` — общий список воркспейса (видят все участники, меняют владелец воркспейса и менеджеры с `manage_workspace_settings`).
  - `NOT NULL` — личный список этого юзера (видит и меняет только владелец).
- **`entity_type`**: `'thread' | 'project'`.
- **`filter_config`**: общий `FilterGroup` из `@/lib/filters/types`. Применяется на фронте через `applyFilters` — не RPC.
- **`columns`**: массив `[{ key, width, order, visible }]`. Реестр доступных колонок и их meta — [`src/page-components/ItemListPage/columns.ts`](../../src/page-components/ItemListPage/columns.ts). MVP: ресайз мышкой не реализован (только width из БД).
- **Корзина**: `is_deleted=true` через `useSoftDeleteItemList`. UI-восстановления пока нет — добавим вместе с общей корзиной воркспейса.
- **RLS**: SELECT/INSERT/UPDATE/DELETE — см. миграцию `20260510_item_lists.sql`. Личные списки несут `owner_user_id = auth.uid()`, общие требуют `is_workspace_owner` или `has_workspace_permission(... 'manage_workspace_settings')`.
- **Хуки**: [`src/hooks/useItemLists.ts`](../../src/hooks/useItemLists.ts) — `useItemLists`, `useItemList`, `useCreateItemList`, `useUpdateItemList`, `useSoftDeleteItemList`. Query keys: `itemListKeys` в `queryKeys.ts`.
- **UI**:
  - `/workspaces/[id]/lists` ([`ItemListsPage`](../../src/page-components/ItemListsPage/index.tsx)) — обзор всех списков (общие + мои личные), кнопка «Создать», карточки с группировкой.
  - `/workspaces/[id]/lists/[listId]` ([`ItemListPage`](../../src/page-components/ItemListPage/index.tsx)) — таблица элементов списка, чекбоксы, тулбар пакетных действий, inline-редактирование статуса/дедлайна для тредов.
  - `CreateItemListDialog` — название, тип (thread/project), личный/общий. После создания — переход на страницу нового списка.
  - `ItemListSettingsDialog` — три вкладки: Общее (название+цвет+сортировка), Фильтр (общий `FilterGroupEditor`), Колонки (показ/скрытие, переупорядочивание).
- **Пакетные действия**: для тредов — смена статуса (только task-треды), архив. Для проектов — статус, архив. При смешанной выборке (есть чаты/email) кнопка «Сменить статус» дизейблена с подсказкой о причине.
- **Закрепить в сайдбар**: `usePinnedItemLists` (см. раздел про сайдбар выше) → слот `list:<uuid>` с иконкой по `entity_type`.
- **Миграции**: `20260510_item_lists.sql` (таблица + RLS + триггер `touch_item_lists_updated_at`), `20260510_rename_task_to_thread_in_board_lists.sql` (миграция `entity_type='task'`→`'thread'` в досках для согласования с item_lists).

## Локальная разработка

```bash
npm install
npm run dev        # http://localhost:8080 (Webpack, не Turbopack)
npm run build      # production build
npm run lint       # ESLint
npm test           # Vitest (613 тестов)
npm run test:watch # Vitest watch mode
```

### Важно: dev-сервер на Webpack, не Turbopack

В `package.json` у `dev` скрипта стоит флаг `--webpack`. Turbopack (который в Next 16 дефолтный) на этом проекте раздувал кеш `.next/dev/cache/turbopack` до 2.5+ ГБ и зависал при HMR — компиляция доходила до 900+ секунд, CPU упирался в 1200%. Webpack: `Ready in 187ms`, первая компиляция страницы ~8s, кеш стабильно 250-400 МБ. Не меняй обратно без причины.

Если dev-сервер опять начал тормозить — сначала убей процесс и удали `.next`:
```bash
pkill -f "next dev"; rm -rf .next tsconfig.tsbuildinfo
```

## Роуты (62)

Точное число: `find src/app -name page.tsx | wc -l`. На 2026-05-11 — **62**.

**Root** (1): `/`

**Auth** (4): `/login`, `/login/email`, `/register`, `/auth/callback`

**Public** (5): `/lawyers`, `/blog`, `/about`, `/privacy`, `/terms`

**App** — приватные, защищены `(app)/layout.tsx` (52):
- Top-level: `/app`, `/profile`, `/dashboard`, `/workspaces`, `/select-workspace`
- Workspace base: `/workspaces/[id]`, `/workspaces/[id]/inbox`, `/workspaces/[id]/inbox/unmatched`, `/workspaces/[id]/tasks`, `/workspaces/[id]/digests`, `/workspaces/[id]/personal-dialogs` (личные диалоги сотрудника TG/Wazzup/Email)
- Projects: `/workspaces/[id]/projects`, `/workspaces/[id]/projects/[projectId]`
- Boards: `/workspaces/[id]/boards`, `/workspaces/[id]/boards/[boardId]`
- Lists: `/workspaces/[id]/lists`, `/workspaces/[id]/lists/[listId]`
- Settings core: `/workspaces/[id]/settings`, `/settings/general`, `/settings/participants`, `/settings/permissions`, `/settings/sidebar`, `/settings/trash`, `/settings/integrations`, `/settings/domain`, `/settings/digest`
- Settings → directories: `/settings/directories`, `/directories/custom`, `/directories/custom/[directoryId]`, `/directories/project-roles`, `/directories/quick-replies`, `/directories/statuses`, `/directories/workspace-roles`, `/directories/finance-services`, `/directories/finance-tax-rates`, `/directories/finance-income-categories`, `/directories/finance-expense-categories`
- Settings → knowledge base: `/settings/knowledge-base`, `/knowledge-base/[articleId]`, `/knowledge-base/qa/[qaId]`
- Settings → templates: `/settings/templates`, `/templates/document-kit-templates`, `/templates/document-kit-templates/[kitId]`, `/templates/document-templates`, `/templates/field-templates`, `/templates/folder-templates`, `/templates/form-templates`, `/templates/form-templates/[templateId]`, `/templates/project-templates`, `/templates/project-templates/[templateId]`, `/templates/slot-templates`, `/templates/thread-templates`

**API** (3 directory с маршрутами): `/api/payments`, `/api/webhooks` (заглушки 501), `/api/resend-webhook` (приём событий Resend для трекинга email).
