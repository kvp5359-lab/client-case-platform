# ClientCase Platform — Infrastructure

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
| Vitest | latest | Тесты |

## Архитектура

- **Фронтенд**: Next.js App Router. Клиентский код в `src/`, страницы и layout-ы — в `src/app/`
- **Бэкенд**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Стилизация**: Tailwind 3 + CSS Variables (HSL) + shadcn/ui
- **Состояние**: React Query (серверное) + Zustand (клиентское)
- **Структура**: `src/page-components/` (тяжёлые компоненты страниц), `src/components/` (переиспользуемые компоненты по модулям)
- **Публичная часть**: `src/app/(public)/` — заглушки для маркетплейса (lawyers, blog, about)
- **Приватная часть**: `src/app/(app)/` — защищена цепочкой middleware → server-side `(app)/layout.tsx` → клиентский `ProtectedRoute` → RLS в БД

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
- **Категории функций**: telegram-* (синхронизация с ботом), gmail-* (почта), google-drive-* / google-sheets-* / google-oauth-* / google-docs-export (Google интеграции), chat-* / generate-* / analyze-documents / extract-* / transcribe-audio / knowledge-* (AI), compress-* (сжатие файлов), email-track, fetch-image, fetch-sheets, fix-cyrillic-storage-paths, sandbox-test.

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

## Статусы проектов (единый справочник + per-template привязка)

- **Хранение**: `projects.status_id` (uuid → `statuses.id`). Текстовая колонка `projects.status` помечена DEPRECATED 2026-04-25 — удалить после 2026-05-09.
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

Состав и порядок верхней части сайдбара (всё кроме списка проектов) — настраиваются на уровне воркспейса. Единая модель: и пункты меню, и доски — это «слоты» одного и того же списка, размещаются в одной из двух зон (топбар/список) или скрываются.

- **Таблица**: `workspace_sidebar_settings (workspace_id PK, slots jsonb, updated_at, updated_by)`. RLS: SELECT — любому участнику; INSERT/UPDATE/DELETE — только владельцу. Если строки нет — фронт берёт дефолт из кода (`DEFAULT_SIDEBAR_SLOTS` в `src/lib/sidebarSettings.ts`).
- **Структура `slots`** (массив): `{ id, type, placement, order, badge_mode }`.
  - `id` — `nav:<key>` (для пунктов меню) или `board:<uuid>` (для досок).
  - `type` — `nav` | `board`.
  - `placement` — `topbar` (иконка в верхней строке) или `list` (полный пункт в основном списке).
  - `order` — позиция внутри своей зоны.
  - `badge_mode` — режим счётчика, единый набор для пунктов и досок: `disabled` | `my_active_tasks` | `all_my_tasks` | `overdue_tasks` | `unread_messages` | `unread_threads`. Бейджи глобальные по воркспейсу — содержимое конкретной доски/пункта не учитывается.
- **Скрытые элементы** не хранятся — они просто отсутствуют в `slots`. На странице настроек выводятся в секции «Доступные» и оттуда переносятся кнопками «в верх» / «в список». Удаление из сайдбара (× у элемента) возвращает его в «Доступные».
- **Доски в «Доступных»** — все доски воркспейса, которых нет в `slots`. Список рендерится автоматически. Закрепить = добавить в одну из зон, открепить = убрать (× в зоне или PinOff на самой иконке доски в сайдбаре).
- **Мёртвые слоты** (доски, удалённые из воркспейса) — фильтруются на рендере. На странице настроек владельцу показывается предупреждение и кнопка «Очистить» для физического удаления.
- **RPC `get_my_task_counts(workspace_id)`** — батч `{ active, all, overdue }` для бейджей задач (active = «сегодня + просрочка», как старый `get_my_urgent_tasks_count`). При мутациях задач инвалидировать `myTaskCountsKeys.byWorkspace(workspaceId)` рядом с `taskKeys.urgentCount` — уже сделано в `useTrash.ts`, `useProjectThreads.ts`, `TaskListView.tsx`.
- **`hasAccess` фильтр** — даже если пункт меню в `slots`, он скрывается у пользователей без соответствующего permission'а (см. `SIDEBAR_NAV_ITEMS[key].hasAccess`). Например, «Шаблоны» не показываются клиенту.
- **Скрытые роуты остаются доступными по прямой ссылке** — настройка управляет только сайдбаром, middleware не трогаем.
- **Хуки**: `useWorkspaceSidebarSettings`, `useUpdateWorkspaceSidebarSettings`, `useMyTaskCounts` в [`src/hooks/useWorkspaceSidebarSettings.ts`](../../src/hooks/useWorkspaceSidebarSettings.ts). `usePinnedBoards` в [`src/components/WorkspaceSidebar/usePinnedBoards.ts`](../../src/components/WorkspaceSidebar/usePinnedBoards.ts) — адаптер над `slots` для совместимости с `BoardsPage` (`isPinned`, `togglePin`).
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

## Telegram Business (личные диалоги сотрудников)

Реализовано 2026-05-03. Архитектура «как у Planfix» — один общий бот сервиса `@clientcase_bot` (id `8669511732`), которого все сотрудники подключают как делегата своего личного TG через **Telegram → Settings → Business → Chatbots**. Требует Telegram Premium у сотрудника. Бот «подсматривает» личные диалоги и тянет их в сервис; ответы из сервиса уходят от имени сотрудника, не бота.

- **Бот**: `@clientcase_bot`, токен в Supabase secrets как `TELEGRAM_BUSINESS_BOT_TOKEN`. В BotFather у бота включён **Business Mode** (`/mybots → Bot Settings → Business Mode → Turn on`) — без этого Telegram не показывает бота в списке доступных делегатов.
- **Webhook**: [`telegram-business-webhook`](../../supabase/functions/telegram-business-webhook/index.ts), деплой `--no-verify-jwt`. Защита — заголовок `X-Telegram-Bot-Api-Secret-Token`, значение в `TELEGRAM_BUSINESS_WEBHOOK_SECRET`. Слушает: `message` (для `/start biz_<token>`), `business_connection`, `business_message`, `edited_business_message`, `deleted_business_messages`.
- **Двухшаговое подключение**:
  1. Сотрудник в UI настроек интеграций → вкладка «Telegram Business» → жмёт «Подключить» → фронт вызывает [`telegram-business-link-init`](../../supabase/functions/telegram-business-link-init/index.ts) → возвращается deep-link `t.me/clientcase_bot?start=biz_<uuid>`. TTL токена — 30 мин.
  2. Сотрудник кликает, в Telegram открывается чат с ботом, жмёт START → webhook ловит `/start biz_<token>` → пишет связку в `user_telegram_links (user_id ↔ tg_user_id)`. Один TG-аккаунт = один user_id (UNIQUE).
  3. Сотрудник идёт в Telegram → Settings → Business → Chatbots → добавляет `@clientcase_bot` с правом «Reply to messages». Прилетает `business_connection` → webhook по `tg_user_id` находит привязку → создаёт запись в `telegram_business_connections`.
- **Хранение диалогов**: каждый сотрудник получает системный проект **«Личные диалоги Telegram»** (`projects.is_system_business_inbox = true` + `system_inbox_user_id`). UNIQUE: один такой проект на сотрудника в воркспейсе. Каждый личный диалог с клиентом = один тред в этом проекте, с полями `business_connection_id` + `business_client_tg_user_id` (UNIQUE-индекс по этой паре). Создаётся автоматически при первом сообщении.
- **Скрытие из общих списков**: системный инбокс **не появляется** в обычном списке проектов и тредов воркспейса. Фильтры в RPC: `get_user_projects` (`p.is_system_business_inbox = false`), `get_workspace_threads` и `get_sidebar_data` (исключают треды через `LEFT JOIN projects` + проверку флага). Доступ к этим тредам — через отдельный экран (TODO).
- **Таблицы и миграции**:
  - `telegram_business_connections (id, workspace_id, user_id, business_connection_id UNIQUE, tg_user_id, tg_username, tg_first_name, tg_last_name, is_enabled, can_reply, connected_at, disconnected_at)` — миграция `20260503_telegram_business.sql`.
  - `user_telegram_links (user_id PK, tg_user_id UNIQUE, tg_username, tg_first_name, tg_last_name, linked_at)` — глобальная привязка, миграция `20260503_user_telegram_links.sql`.
  - `telegram_business_link_tokens (token, user_id, workspace_id, expires_at, consumed_at)` — одноразовые токены шага 1.
  - `projects.is_system_business_inbox` + `projects.system_inbox_user_id` — миграция `20260503_telegram_business.sql`.
  - `project_threads.business_connection_id` + `project_threads.business_client_tg_user_id` — миграция `20260503_telegram_business.sql`.
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
- **Системный инбокс**: `projects.is_system_wazzup_inbox = true` + `system_inbox_user_id`. Аналог Telegram Business. Скрыт из общих списков фильтром в [`useSidebarData.ts`](../../src/components/WorkspaceSidebar/useSidebarData.ts). Один на сотрудника (partial UNIQUE-индекс `uq_projects_system_wazzup_inbox_per_user`).
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
- **TODO MVP+1**: вложения (фото/файлы/голосовые через `contentUri`), реакции (Wazzup отдаёт через webhook, но сейчас не обрабатываем), редактирование/удаление сообщений, привязка тредов к проектам (как у inbox-почты), синхронизация прочтений в обе стороны.

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

## Роуты (51)

Точное число: `find src/app -name page.tsx | wc -l`. На 2026-04-27 — **51**.

**Root** (1): `/`

**Auth** (4): `/login`, `/login/email`, `/register`, `/auth/callback`

**Public** (5): `/lawyers`, `/blog`, `/about`, `/privacy`, `/terms`

**App** — приватные, защищены `(app)/layout.tsx` (36):
- Top-level: `/profile`, `/dashboard`, `/workspaces`
- Workspace: `/workspaces/[id]`, `/workspaces/[id]/inbox`, `/workspaces/[id]/tasks`
- Projects: `/workspaces/[id]/projects`, `/workspaces/[id]/projects/[projectId]`
- Boards: `/workspaces/[id]/boards`, `/workspaces/[id]/boards/[boardId]`
- Settings core: `/workspaces/[id]/settings`, `/workspaces/[id]/settings/general`, `/workspaces/[id]/settings/participants`, `/workspaces/[id]/settings/permissions`, `/workspaces/[id]/settings/sidebar`, `/workspaces/[id]/settings/trash`
- Settings → directories: `/workspaces/[id]/settings/directories`, `/directories/custom`, `/directories/custom/[directoryId]`, `/directories/project-roles`, `/directories/quick-replies`, `/directories/statuses`, `/directories/workspace-roles`
- Settings → knowledge base: `/workspaces/[id]/settings/knowledge-base`, `/knowledge-base/[articleId]`, `/knowledge-base/qa/[qaId]`
- Settings → templates: `/workspaces/[id]/settings/templates`, `/templates/document-kit-templates`, `/templates/document-kit-templates/[kitId]`, `/templates/document-templates`, `/templates/field-templates`, `/templates/folder-templates`, `/templates/form-templates`, `/templates/form-templates/[templateId]`, `/templates/project-templates`, `/templates/project-templates/[templateId]`, `/templates/thread-templates`

**API** (2): `/api/payments`, `/api/webhooks` — заглушки 501
