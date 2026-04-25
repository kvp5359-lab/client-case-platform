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
- **Docker-контейнер**: `clientcase-app` — Next.js standalone, порт 3000 внутри → **3005** на хосте
- **Docker-образ**: `ghcr.io/kvp5359-lab/client-case-platform:latest`
- **Docker-сеть**: `relostart_web` (общая с nginx и другими сервисами)

### Nginx (reverse proxy)

- **Контейнер**: `relostart-nginx` (из `/opt/relostart/`)
- **Конфиг ClientCase**: `/opt/relostart/nginx/conf.d/app-relostart.conf`
- **Upstream**: `clientcase-app:3000` (по имени контейнера через Docker-сеть)
- **Домены**: `app.relostart.com`, `clientcase.kvp-projects.com`
- **SSL**: Let's Encrypt (certbot контейнер `relostart-certbot`)
- **Буферы прокси**: увеличены до 128k/256k (Supabase auth куки большие)

### Другие контейнеры на VPS

| Контейнер | Порт | Назначение |
|-----------|------|-----------|
| `relostart-app` | 3000 | Основной Relostart |
| `relostart-app-dev` | 3001 | Relostart dev |
| `migcases-app-dev` | 3002 | MigCases dev |
| `kb-frontend` | 3003 | Knowledge Base frontend |
| `migcases-app-prod` | 3004 | MigCases prod |
| `clientcase-app` | 3005 | **ClientCase** |
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

## Статусы проектов (только на уровне шаблона + автопереход)

- **Хранение**: `projects.status_id` (uuid → `statuses.id`). Текстовая колонка `projects.status` помечена DEPRECATED 2026-04-25 — будет удалена после 2026-05-09.
- **Принадлежность**: `statuses.project_template_id` для project-статусов **обязателен** (CHECK `project_status_must_have_template`). Концепции «общих воркспейсных project-статусов» нет — проекты без шаблона или шаблоны без статусов означают «без статуса». Для других `entity_type` (task/document/...) `project_template_id` остаётся NULL — они живут на уровне воркспейса.
- **Резолв набора**: хук `useProjectStatusesForTemplate(workspaceId, templateId)` — возвращает только статусы заданного шаблона. Без шаблона → пустой массив.
- **Автопереход**: `thread_templates.on_complete_set_project_status_id`. Если задано — при переходе треда (созданного из этого шаблона) в финальный статус, БД-триггер `auto_advance_project_status` обновляет `projects.status_id` соответствующего проекта. **Last write wins** — текущий статус проекта не сверяется.
- **UI настройки**: вкладка статусов внутри редактора шаблона проекта (`/templates/project-templates/[id]`) — `ProjectTemplateStatusesSection`. Поле автоперехода в `ThreadTemplateDialog` (только для task-режима).
- **Удаление статуса с проектами**: открывается `StatusReassignDialog` — сначала переводим проекты на замену, потом удаляем. Реализовано и в общем справочнике (`/directories/statuses`), и в редакторе шаблона.

## Локальная разработка

```bash
npm install
npm run dev        # http://localhost:8080 (Webpack, не Turbopack)
npm run build      # production build
npm run lint       # ESLint
npm test           # Vitest (26 тестов)
npm run test:watch # Vitest watch mode
```

### Важно: dev-сервер на Webpack, не Turbopack

В `package.json` у `dev` скрипта стоит флаг `--webpack`. Turbopack (который в Next 16 дефолтный) на этом проекте раздувал кеш `.next/dev/cache/turbopack` до 2.5+ ГБ и зависал при HMR — компиляция доходила до 900+ секунд, CPU упирался в 1200%. Webpack: `Ready in 187ms`, первая компиляция страницы ~8s, кеш стабильно 250-400 МБ. Не меняй обратно без причины.

Если dev-сервер опять начал тормозить — сначала убей процесс и удали `.next`:
```bash
pkill -f "next dev"; rm -rf .next tsconfig.tsbuildinfo
```

## Роуты (46)

Точное число: `find src/app -name page.tsx | wc -l`. На 2026-04-11 — **46**.

**Root** (1): `/`

**Auth** (4): `/login`, `/login/email`, `/register`, `/auth/callback`

**Public** (5): `/lawyers`, `/blog`, `/about`, `/privacy`, `/terms`

**App** — приватные, защищены `(app)/layout.tsx` (36):
- Top-level: `/profile`, `/dashboard`, `/workspaces`
- Workspace: `/workspaces/[id]`, `/workspaces/[id]/inbox`, `/workspaces/[id]/tasks`
- Projects: `/workspaces/[id]/projects`, `/workspaces/[id]/projects/[projectId]`
- Boards: `/workspaces/[id]/boards`, `/workspaces/[id]/boards/[boardId]`
- Settings core: `/workspaces/[id]/settings`, `/workspaces/[id]/settings/general`, `/workspaces/[id]/settings/participants`, `/workspaces/[id]/settings/permissions`, `/workspaces/[id]/settings/trash`
- Settings → directories: `/workspaces/[id]/settings/directories`, `/directories/custom`, `/directories/custom/[directoryId]`, `/directories/project-roles`, `/directories/quick-replies`, `/directories/statuses`, `/directories/workspace-roles`
- Settings → knowledge base: `/workspaces/[id]/settings/knowledge-base`, `/knowledge-base/[articleId]`, `/knowledge-base/qa/[qaId]`
- Settings → templates: `/workspaces/[id]/settings/templates`, `/templates/document-kit-templates`, `/templates/document-kit-templates/[kitId]`, `/templates/document-templates`, `/templates/field-templates`, `/templates/folder-templates`, `/templates/form-templates`, `/templates/form-templates/[templateId]`, `/templates/project-templates`, `/templates/project-templates/[templateId]`, `/templates/thread-templates`

**API** (2): `/api/payments`, `/api/webhooks` — заглушки 501
