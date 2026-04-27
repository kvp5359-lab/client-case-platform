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
