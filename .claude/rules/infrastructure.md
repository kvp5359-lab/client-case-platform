# ClientCase Platform — Infrastructure

## Баг-лог

Известные баги — в `docs/bugs/`. Индекс: [`docs/bugs/README.md`](../../docs/bugs/README.md). Открытые — в `docs/bugs/open/`, решённые — в `docs/bugs/resolved/`. При жалобе на странное поведение **сначала** заглянуть в индекс — возможно, баг уже расследован и есть готовые гипотезы.

## Стек

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | 16.x (App Router) | Фреймворк, SSR + SPA |
| React | 19.x | UI-библиотека |
| TypeScript | 5.x | Типизация |
| Tailwind CSS | 3.x | Стили (JS-конфигурация) |
| shadcn/ui | latest | UI-компоненты (43 файла) |
| Radix UI | latest | Примитивы для UI |
| TanStack React Query | 5.x | Серверное состояние |
| Zustand | 5.x | Клиентское состояние |
| React Hook Form + Zod | 7.x | Формы и валидация |
| Tiptap | latest | Rich text editor |
| @dnd-kit | latest | Drag & drop |
| Supabase JS | 2.x | БД, Auth, Storage, Realtime |
| Vitest | latest | Тесты |

## Архитектура

- **Фронтенд**: Next.js App Router. Клиентский код в `src/`, страницы в `app/`
- **Бэкенд**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Стилизация**: Tailwind 3 + CSS Variables (HSL) + shadcn/ui
- **Состояние**: React Query (серверное) + Zustand (клиентское)
- **Структура**: `src/page-components/` (перенесённые страницы), `src/components/` (компоненты по модулям)
- **Публичная часть**: `app/(public)/` — заглушки для маркетплейса (lawyers, blog, about)
- **Приватная часть**: `app/(app)/` — защищена ProtectedRoute + Supabase middleware

## Supabase

- Проект: `zjatohckcpiqmxkmfxbs`
- URL: `https://zjatohckcpiqmxkmfxbs.supabase.co`
- Общая БД с оригинальным ClientCase
- SSR клиент: `src/lib/supabase-server.ts`
- Клиентский: `src/lib/supabase.ts`

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

## Роуты (27)

**Auth**: /login, /login/email, /register, /auth/callback
**App**: /profile, /dashboard, /workspaces, /workspaces/[id], /workspaces/[id]/inbox, /workspaces/[id]/projects, /workspaces/[id]/projects/[id], /workspaces/[id]/tasks
**Settings**: /workspaces/[id]/settings, /workspaces/[id]/settings/knowledge-base/*, /workspaces/[id]/settings/templates/*
**Public**: /lawyers, /blog, /about
**API**: /api/payments, /api/webhooks
