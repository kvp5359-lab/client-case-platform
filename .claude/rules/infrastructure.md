# ClientCase Platform — Infrastructure

## Стек

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| Next.js | 16.x (App Router) | Фреймворк, SSR + SPA |
| React | 19.x | UI-библиотека |
| TypeScript | 5.x | Типизация |
| Tailwind CSS | 3.x | Стили (JS-конфигурация) |
| shadcn/ui | latest | UI-компоненты |
| Radix UI | latest | Примитивы для UI |
| Supabase JS | 2.x | БД, Auth, Storage, Realtime |

## Архитектура

- **Фронтенд**: Next.js App Router. Клиентский код в `src/`, страницы в `app/`
- **Бэкенд**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions)
- **Стилизация**: Tailwind 3 + CSS Variables (HSL) + shadcn/ui
- **Состояние**: React Query (серверное) + Zustand (клиентское)

## Supabase

- Проект: `zjatohckcpiqmxkmfxbs`
- URL: `https://zjatohckcpiqmxkmfxbs.supabase.co`
- Общая БД с оригинальным ClientCase

## Окружение

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase проекта |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публичный anon ключ |
| `NEXT_PUBLIC_APP_NAME` | Имя приложения |

## Деплой

- Репозиторий: https://github.com/kvp5359-lab/client-case-platform
- CI/CD: GitHub Actions (build + lint на PR)
- Хостинг: Vercel (планируется)

## Локальная разработка

```bash
npm install
npm run dev    # http://localhost:3000
npm run build  # production build
npm run lint   # ESLint
```
