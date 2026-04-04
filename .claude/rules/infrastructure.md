# ClientCase Platform — Infrastructure

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
- CI/CD: GitHub Actions (build + lint на PR)
- Хостинг: Vercel (планируется)

## Маркетплейс (фундамент)

- SQL-миграции: `supabase/migrations/20260404_marketplace_tables.sql` (НЕ применены)
- Таблицы: service_categories, lawyer_profiles, lawyer_services, orders, payments, payouts, reviews, blog_posts, blog_categories, custom_domains
- API Routes: `/api/payments`, `/api/webhooks` (заглушки)

## Локальная разработка

```bash
npm install
npm run dev        # http://localhost:8081
npm run build      # production build
npm run lint       # ESLint
npm test           # Vitest (26 тестов)
npm run test:watch # Vitest watch mode
```

## Роуты (27)

**Auth**: /login, /login/email, /register, /auth/callback
**App**: /profile, /dashboard, /workspaces, /workspaces/[id], /workspaces/[id]/inbox, /workspaces/[id]/projects, /workspaces/[id]/projects/[id], /workspaces/[id]/tasks
**Settings**: /workspaces/[id]/settings, /workspaces/[id]/settings/knowledge-base/*, /workspaces/[id]/settings/templates/*
**Public**: /lawyers, /blog, /about
**API**: /api/payments, /api/webhooks
