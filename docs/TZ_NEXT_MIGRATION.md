# Техническое задание: Миграция ClientCase на Next.js + фундамент маркетплейса

> Дата: 2026-04-04
> Статус: Черновик
> Связанный документ: `docs/IDEA_LEGAL_MARKETPLACE.md`

---

## 1. Цели проекта

### Приоритет 1 (обязательно)
Перенести весь текущий функционал ClientCase на Next.js. После переноса — полностью заменить текущий ClientCase. Пользователь должен получить тот же опыт, что и сейчас.

### Приоритет 2 (фундамент, без реализации UI)
Заложить архитектуру для будущего маркетплейса: структуру роутинга, разделение на публичную/приватную части, серверные API Routes. Не реализовывать UI маркетплейса — только подготовить «место» для него.

---

## 2. Технический стек

### Новый стек

| Технология | Версия | Назначение |
|-----------|--------|-----------|
| **Next.js** | 15.x (App Router) | Фреймворк, SSR + SPA |
| **React** | 19.x | UI-библиотека |
| **TypeScript** | 5.x | Типизация |
| **Tailwind CSS** | 4.x | Стили |
| **shadcn/ui** | latest | UI-компоненты (переносятся из ClientCase) |
| **Radix UI** | latest | Примитивы для UI |
| **TanStack React Query** | 5.x | Серверное состояние |
| **Zustand** | 5.x | Клиентское состояние |
| **React Hook Form** | 7.x + Zod | Формы и валидация |
| **Tiptap** | 3.x | Rich text editor |
| **@dnd-kit** | latest | Drag & drop |
| **@tanstack/react-virtual** | latest | Виртуализация списков |
| **Supabase JS** | 2.x | БД, Auth, Storage, Realtime |
| **Vitest** | latest | Тесты |

### Что меняется относительно текущего стека

| Было | Стало | Причина |
|------|-------|---------|
| Vite 5.x | Next.js 15.x | SSR, API Routes, серверные компоненты |
| React 18.x | React 19.x | Совместимость с Next.js 15 |
| React Router 6.x | Next.js App Router | Файловый роутинг |
| Tailwind 3.x | Tailwind 4.x | Актуальная версия для нового проекта |
| `import.meta.env.VITE_*` | `process.env.NEXT_PUBLIC_*` | Переменные окружения Next.js |

### Что НЕ меняется

- Supabase (тот же проект, та же БД, те же Edge Functions)
- shadcn/ui, Radix UI, Zustand, React Query, React Hook Form, Zod, Tiptap, @dnd-kit
- Все сервисы, утилиты, типы — переносятся

---

## 3. Инфраструктура

### Supabase

**Тот же проект** (zjatohckcpiqmxkmfxbs). Новые таблицы добавляются через миграции рядом с существующими. Оба приложения (старый ClientCase и новый Next.js) работают параллельно с одной БД.

### Репозиторий

Новый Git-репозиторий. Код ClientCase копируется файлами, не форком — чтобы начать с чистой историей.

### Деплой

| Среда | Хостинг | Домен |
|-------|---------|-------|
| Dev | Vercel (бесплатный план) или VPS | `v2.clientcase.dev` или аналог |
| Production | Vercel Pro или VPS (72.61.82.244) | Новый домен (определить позже) |

### CI/CD

GitHub Actions:
- `npm run build` — проверка сборки при каждом PR
- `npm run lint` — линтинг
- `npm run test` — тесты
- Деплой на Vercel автоматически при push в main

---

## 4. Структура проекта Next.js

```
/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Корневой layout (провайдеры)
│   ├── page.tsx                      # Главная (→ редирект в /profile или лендинг)
│   ├── globals.css                   # Глобальные стили
│   │
│   ├── (auth)/                       # Группа: авторизация (без layout workspace)
│   │   ├── login/
│   │   │   ├── page.tsx              # Вход
│   │   │   └── email/
│   │   │       └── page.tsx          # OTP по email
│   │   ├── register/
│   │   │   └── page.tsx              # Регистрация
│   │   └── auth/
│   │       └── callback/
│   │           └── page.tsx          # OAuth callback
│   │
│   ├── (app)/                        # Группа: приложение (с ProtectedRoute)
│   │   ├── layout.tsx                # Layout с AuthProvider
│   │   ├── profile/
│   │   │   └── page.tsx              # Профиль пользователя
│   │   ├── workspaces/
│   │   │   ├── page.tsx              # Список workspace'ов
│   │   │   └── [workspaceId]/
│   │   │       ├── layout.tsx        # Layout с WorkspaceProvider
│   │   │       ├── page.tsx          # Главная workspace
│   │   │       ├── inbox/
│   │   │       │   └── page.tsx      # Входящие сообщения
│   │   │       ├── tasks/
│   │   │       │   └── page.tsx      # Задачи (канбан)
│   │   │       ├── projects/
│   │   │       │   ├── page.tsx      # Список проектов
│   │   │       │   └── [projectId]/
│   │   │       │       ├── layout.tsx # Layout с ProjectProvider
│   │   │       │       └── page.tsx  # Страница проекта (вкладки)
│   │   │       └── settings/
│   │   │           ├── page.tsx      # Настройки workspace
│   │   │           ├── templates/
│   │   │           │   ├── form-templates/
│   │   │           │   │   └── [templateId]/
│   │   │           │   │       └── page.tsx
│   │   │           │   ├── document-kit-templates/
│   │   │           │   │   └── [kitId]/
│   │   │           │   │       └── page.tsx
│   │   │           │   └── project-templates/
│   │   │           │       └── [templateId]/
│   │   │           │           └── page.tsx
│   │   │           └── knowledge-base/
│   │   │               ├── page.tsx
│   │   │               ├── [articleId]/
│   │   │               │   └── page.tsx
│   │   │               └── qa/
│   │   │                   └── [qaId]/
│   │   │                       └── page.tsx
│   │
│   ├── (public)/                     # ФУНДАМЕНТ: публичная часть (SSR, SEO)
│   │   ├── layout.tsx                # Публичный layout (без auth)
│   │   ├── lawyers/                  # Заглушка: каталог юристов
│   │   │   └── page.tsx              # Placeholder
│   │   ├── blog/                     # Заглушка: блог
│   │   │   └── page.tsx              # Placeholder
│   │   └── about/                    # Заглушка: о платформе
│   │       └── page.tsx              # Placeholder
│   │
│   └── api/                          # ФУНДАМЕНТ: серверные API Routes
│       ├── payments/                 # Заглушка: платежи
│       │   └── route.ts             # Placeholder
│       └── webhooks/                 # Заглушка: webhooks
│           └── route.ts             # Placeholder
│
├── src/                              # Весь клиентский код (перенос из ClientCase)
│   ├── components/                   # React-компоненты
│   │   ├── ui/                       # shadcn/ui (~42 файла)
│   │   ├── auth/                     # Авторизация (~11)
│   │   ├── messenger/                # Мессенджер (~73)
│   │   ├── documents/                # Документы (~32)
│   │   ├── forms/                    # Формы и FormKit (~14)
│   │   ├── tasks/                    # Задачи (~22)
│   │   ├── projects/                 # Проекты и DocumentKits (~73)
│   │   ├── templates/                # Шаблоны (~81)
│   │   ├── tiptap-editor/            # Rich text editor (~28)
│   │   ├── knowledge/                # База знаний (~11)
│   │   ├── directories/              # Справочники (~21)
│   │   ├── history/                  # История (~7)
│   │   ├── comments/                 # Комментарии (~6)
│   │   ├── participants/             # Участники (~5)
│   │   ├── permissions/              # Права (~2)
│   │   ├── WorkspaceSidebar/         # Боковая панель (~11)
│   │   ├── ai-panel/                 # AI-ассистент (~9)
│   │   ├── shared/                   # Общие (~7)
│   │   ├── extra-panel/              # Доп. панель (~1)
│   │   └── providers/                # Route providers (~1)
│   │
│   ├── hooks/                        # Custom hooks (~90 файлов)
│   │   ├── shared/                   # Общие (useDebounce, useDialog, etc.)
│   │   ├── messenger/                # Мессенджер (~28)
│   │   ├── documents/                # Документы (~16)
│   │   ├── forms/                    # Формы (~2)
│   │   ├── knowledge/                # База знаний (~6)
│   │   ├── permissions/              # Права (~6)
│   │   ├── comments/                 # Комментарии (~3)
│   │   ├── tasks/                    # Задачи (~1)
│   │   ├── email/                    # Email (~5)
│   │   ├── custom-directories/       # Справочники (~4)
│   │   ├── dialogs/                  # Диалоги (~2)
│   │   ├── queryKeys.ts             # Ключи React Query
│   │   └── index.ts                 # Re-exports
│   │
│   ├── services/                     # API-сервисы (~48 файлов)
│   │   ├── api/                      # REST API (~28)
│   │   ├── documents/                # Документы (~12)
│   │   ├── supabase/                 # Supabase-клиент (~3)
│   │   ├── errors/                   # Ошибки (~3)
│   │   └── auditService.ts          # Аудит-логи
│   │
│   ├── store/                        # Zustand stores
│   │   ├── workspaceStore.ts
│   │   ├── sidePanelStore.ts
│   │   ├── sidePanelStore.types.ts
│   │   ├── sidePanelStore.localStorage.ts
│   │   └── documentKitUI/            # Document Kit UI store
│   │
│   ├── contexts/                     # React контексты
│   │   ├── AuthContext.tsx
│   │   ├── ProjectContext.tsx
│   │   └── WorkspaceContext.tsx
│   │
│   ├── types/                        # TypeScript типы
│   │   ├── database.ts               # Автогенерация из Supabase (~6000 строк)
│   │   ├── entities.ts
│   │   ├── formKit.ts
│   │   ├── permissions.ts
│   │   ├── comments.ts
│   │   ├── customDirectories.ts
│   │   ├── dialogs.ts
│   │   ├── history.ts
│   │   └── threadTemplate.ts
│   │
│   ├── utils/                        # Утилиты (~22 файла)
│   │   ├── dateFormat.ts
│   │   ├── sanitizeHtml.ts
│   │   ├── logger.ts
│   │   ├── formatSize.ts
│   │   ├── fileValidation.ts
│   │   ├── downloadBlob.ts
│   │   ├── csvParser.ts
│   │   ├── mergePDF.ts
│   │   ├── messengerHtml.ts
│   │   └── ...
│   │
│   └── lib/                          # Библиотечные обёртки
│       ├── supabase.ts               # Supabase client init
│       ├── utils.ts                  # cn() — className merge
│       └── styles/
│           └── design-tokens.ts
│
├── supabase/                         # НЕ ТРОГАТЬ — используется как есть
│   ├── functions/                    # Edge Functions (28 функций)
│   │   ├── _shared/                  # Общие модули
│   │   └── */index.ts               # Каждая функция
│   ├── migrations/                   # SQL-миграции
│   └── config.toml
│
├── public/                           # Статика
├── next.config.ts                    # Конфигурация Next.js
├── tailwind.config.ts                # Tailwind
├── tsconfig.json                     # TypeScript
├── package.json
├── .env.local                        # Переменные окружения (не в git)
└── .github/
    └── workflows/
        └── deploy.yml                # CI/CD
```

---

## 5. Перенос: пошаговый план

### Этап 1: Каркас проекта

**Цель:** Пустой Next.js проект, который собирается и деплоится.

**Задачи:**

1.1. Инициализировать Next.js 15 (App Router, TypeScript, Tailwind 4, ESLint)
```bash
npx create-next-app@latest --typescript --tailwind --eslint --app --src-dir
```

1.2. Настроить `tsconfig.json`:
- Алиас `@/` → `./src/` (как в текущем проекте, чтобы импорты не менялись)

1.3. Настроить `next.config.ts`:
- `images.remotePatterns` — Supabase Storage домен
- `experimental.serverActions` — включить

1.4. Перенести `tailwind.config.ts`:
- Адаптировать под Tailwind 4 (CSS-first конфигурация)
- Перенести все кастомные цвета, шрифты, анимации

1.5. Перенести `globals.css` (из `src/index.css`):
- Design tokens
- Кастомные утилиты
- shadcn/ui CSS variables

1.6. Настроить `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://zjatohckcpiqmxkmfxbs.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_NAME=ClientCase
```

1.7. Настроить Supabase клиент (`src/lib/supabase.ts`):
- Заменить `import.meta.env.VITE_*` на `process.env.NEXT_PUBLIC_*`
- Создать клиент для серверных компонентов (SSR) и для клиентских

1.8. Настроить CI/CD (GitHub Actions):
- Build check на PR
- Auto-deploy на Vercel при push в main

**Критерий готовности:** `npm run build` проходит, приложение открывается на localhost.

---

### Этап 2: Дизайн-система и UI-компоненты

**Цель:** Все shadcn/ui компоненты и утилиты работают.

**Задачи:**

2.1. Скопировать `src/components/ui/` — все 42 файла:
```
accordion, alert-dialog, avatar, badge, breadcrumb, button,
calendar, card, checkbox, collapsible, command, context-menu,
dialog, dropdown-menu, form, input, label, menubar, navigation-menu,
pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton,
slider, spinner, switch, table, tabs, textarea, toast, toaster,
toggle, toggle-group, tooltip
```

2.2. Скопировать `src/lib/utils.ts` (cn function)

2.3. Скопировать `src/lib/styles/design-tokens.ts`

2.4. Скопировать `src/components/shared/` — 7 файлов общих компонентов

2.5. Установить все UI-зависимости:
```bash
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-popover @radix-ui/react-select @radix-ui/react-tabs \
  @radix-ui/react-tooltip @radix-ui/react-accordion \
  @radix-ui/react-checkbox @radix-ui/react-switch \
  @radix-ui/react-avatar @radix-ui/react-label \
  @radix-ui/react-scroll-area @radix-ui/react-separator \
  @radix-ui/react-slider @radix-ui/react-toggle \
  @radix-ui/react-toggle-group @radix-ui/react-collapsible \
  @radix-ui/react-context-menu @radix-ui/react-menubar \
  @radix-ui/react-navigation-menu @radix-ui/react-progress \
  @radix-ui/react-radio-group \
  class-variance-authority clsx tailwind-merge \
  lucide-react sonner react-day-picker date-fns
```

2.6. Проверить: каждый UI-компонент рендерится без ошибок.

**Критерий готовности:** Можно импортировать и использовать любой UI-компонент.

---

### Этап 3: Типы, утилиты, сервисы

**Цель:** Весь «бэкенд-слой» фронтенда работает.

**Задачи:**

3.1. Скопировать `src/types/` — все файлы (включая `database.ts` ~6000 строк)

3.2. Скопировать `src/utils/` — все 22 файла

3.3. Скопировать `src/services/` — все 48 файлов:
- `services/api/` (28 файлов)
- `services/documents/` (12 файлов)
- `services/supabase/` (3 файла)
- `services/errors/` (3 файла)
- `services/auditService.ts`

3.4. Скопировать `src/lib/supabase.ts` — адаптировать env-переменные

3.5. Установить зависимости сервисов:
```bash
npm install @supabase/supabase-js @supabase/ssr pdf-lib jszip dompurify \
  react-markdown remark-gfm
```

3.6. Глобальная замена переменных окружения:
- `import.meta.env.VITE_SUPABASE_URL` → `process.env.NEXT_PUBLIC_SUPABASE_URL`
- `import.meta.env.VITE_SUPABASE_ANON_KEY` → `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `import.meta.env.VITE_APP_NAME` → `process.env.NEXT_PUBLIC_APP_NAME`
- `import.meta.env.DEV` → `process.env.NODE_ENV === 'development'`

3.7. Проверить: `npm run build` проходит без ошибок типизации.

**Критерий готовности:** Все сервисы и утилиты импортируются и компилируются.

---

### Этап 4: Стор, контексты, хуки

**Цель:** Всё управление состоянием работает.

**Задачи:**

4.1. Скопировать `src/store/`:
- `workspaceStore.ts`
- `sidePanelStore.ts` + `sidePanelStore.types.ts` + `sidePanelStore.localStorage.ts`
- `documentKitUI/` — целиком (7 файлов)

4.2. Скопировать `src/contexts/`:
- `AuthContext.tsx` — добавить `"use client"`
- `ProjectContext.tsx` — добавить `"use client"`
- `WorkspaceContext.tsx` — добавить `"use client"`

4.3. Скопировать `src/hooks/` — все ~90 файлов:
- Во все файлы с React-хуками добавить `"use client"`
- `queryKeys.ts` — копируется без изменений (нет React-хуков)

4.4. Установить зависимости:
```bash
npm install zustand @tanstack/react-query @tanstack/react-virtual
```

4.5. Проверить: `npm run build` проходит.

**Критерий готовности:** Все хуки, сторы и контексты компилируются.

---

### Этап 5: Корневой layout и провайдеры

**Цель:** Авторизация работает, пользователь может войти.

**Задачи:**

5.1. Создать `app/layout.tsx` (корневой layout):
```tsx
// Серверный компонент — без "use client"
export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

5.2. Создать `src/components/providers/Providers.tsx`:
```tsx
"use client"
// Клиентский компонент — все провайдеры
<QueryClientProvider>
  <Toaster />
  <ErrorBoundary>
    <AuthProvider>
      {children}
    </AuthProvider>
  </ErrorBoundary>
</QueryClientProvider>
```

QueryClient конфиг — перенести из текущего App.tsx:
```ts
{
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
    }
  }
}
```

Toaster конфиг — перенести из текущего App.tsx:
```ts
{
  position: "bottom-right",
  richColors: true,
  closeButton: true,
  visibleToasts: 5,
}
```

5.3. Создать `app/(auth)/` — страницы авторизации:
- Скопировать `LoginPage.tsx` → `app/(auth)/login/page.tsx`
- Скопировать `RegisterPage.tsx` → `app/(auth)/register/page.tsx`
- Скопировать `EmailOtpPage.tsx` → `app/(auth)/login/email/page.tsx`
- Скопировать `AuthCallbackPage.tsx` → `app/(auth)/auth/callback/page.tsx`
- Все — с `"use client"`, заменить `useNavigate()` на `useRouter()`

5.4. Скопировать `src/components/auth/` — 11 файлов:
- `ProtectedRoute.tsx` — адаптировать: вместо `<Navigate to="/login">` → `redirect('/login')` или `useRouter().push('/login')`

5.5. Создать middleware для защиты роутов (`middleware.ts` в корне):
```ts
// Проверка auth-сессии Supabase на уровне middleware
// Редирект на /login если нет сессии
```

5.6. Проверить: можно войти, выйти, зарегистрироваться.

**Критерий готовности:** Авторизация работает полностью (email+пароль, OTP, Google OAuth).

---

### Этап 6: Workspace и навигация

**Цель:** Пользователь видит свои workspace'ы, может переключаться.

**Задачи:**

6.1. Создать `app/(app)/layout.tsx`:
- Обёрнут в `ProtectedRoute`
- Содержит общий layout для авторизованной зоны

6.2. Скопировать страницы:
- `WorkspacesPage.tsx` → `app/(app)/workspaces/page.tsx`
- `ProfilePage.tsx` → `app/(app)/profile/page.tsx`

6.3. Создать `app/(app)/workspaces/[workspaceId]/layout.tsx`:
- WorkspaceProvider (из `src/contexts/WorkspaceContext.tsx`)
- WorkspaceSidebar

6.4. Скопировать `src/components/WorkspaceSidebar/` — 11 файлов:
- Добавить `"use client"` во все
- Заменить `useNavigate()` → `useRouter()`, `<Link to=...>` → `<Link href=...>`

6.5. Скопировать `WorkspacePage.tsx` → `app/(app)/workspaces/[workspaceId]/page.tsx`

6.6. Глобальная замена навигации (во всех скопированных файлах):
- `import { useNavigate, Link } from 'react-router-dom'` → `import { useRouter } from 'next/navigation'` + `import Link from 'next/link'`
- `navigate('/path')` → `router.push('/path')`
- `navigate(-1)` → `router.back()`
- `<Link to="/path">` → `<Link href="/path">`
- `useParams()` — из `next/navigation` вместо `react-router-dom`
- `useSearchParams()` — из `next/navigation`

6.7. Проверить: навигация между workspace'ами работает.

**Критерий готовности:** Можно увидеть список workspace'ов, войти в workspace, видеть боковую панель.

---

### Этап 7: Страница проекта

**Цель:** Полностью рабочая страница проекта со всеми вкладками.

**Задачи:**

7.1. Создать `app/(app)/workspaces/[workspaceId]/projects/page.tsx` — список проектов

7.2. Создать `app/(app)/workspaces/[workspaceId]/projects/[projectId]/layout.tsx`:
- ProjectProvider (из `src/contexts/ProjectContext.tsx`)

7.3. Создать `app/(app)/workspaces/[workspaceId]/projects/[projectId]/page.tsx`:
- Скопировать логику из `ProjectPage.tsx`

7.4. Скопировать все компоненты страницы проекта:
- `src/pages/ProjectPage/` — все подкомпоненты
- `src/pages/ProjectPage/components/Documents/` — вкладка документов
- `src/pages/ProjectPage/components/` — остальные вкладки

7.5. Скопировать компоненты по модулям:
- `src/components/documents/` — 32 файла
- `src/components/forms/` — 14 файлов
- `src/components/tasks/` — 22 файла
- `src/components/comments/` — 6 файлов
- `src/components/history/` — 7 файлов
- `src/components/participants/` — 5 файлов
- `src/components/permissions/` — 2 файла
- `src/components/tiptap-editor/` — 28 файлов

7.6. Установить дополнительные зависимости:
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-placeholder \
  @tiptap/extension-link @tiptap/extension-image @tiptap/extension-underline \
  @tiptap/extension-text-align @tiptap/extension-color \
  @tiptap/extension-text-style @tiptap/extension-highlight \
  @tiptap/extension-table @tiptap/extension-table-row \
  @tiptap/extension-table-cell @tiptap/extension-table-header \
  react-dropzone react-hook-form @hookform/resolvers zod
```

7.7. Проверить: страница проекта открывается, все вкладки работают.

**Критерий готовности:** Документы, формы, задачи, участники, комментарии, история — всё работает как в текущем ClientCase.

---

### Этап 8: Мессенджер

**Цель:** Мессенджер работает полностью, включая Realtime.

**Задачи:**

8.1. Скопировать `src/components/messenger/` — 73 файла:
- Все с `"use client"`
- Проверить Realtime-подписки (Supabase channels)

8.2. Скопировать хуки мессенджера `src/hooks/messenger/` — 28 файлов

8.3. Скопировать сервисы мессенджера:
- `src/services/api/messengerService.ts`
- `src/services/api/messengerAiService.ts`
- `src/services/api/messengerAttachmentService.ts`
- `src/services/api/messengerReactionService.ts`
- `src/services/api/messengerReadStatusService.ts`
- `src/services/api/inboxService.ts`

8.4. Скопировать компоненты боковой панели:
- `src/components/ai-panel/` — 9 файлов
- `src/components/extra-panel/` — 1 файл

8.5. Создать страницу Inbox:
- `app/(app)/workspaces/[workspaceId]/inbox/page.tsx`
- Скопировать логику из `src/pages/InboxPage/`

8.6. Проверить:
- Отправка/получение сообщений
- Реакции
- Вложения (загрузка файлов)
- Realtime (сообщения появляются без перезагрузки)
- Статус прочтения

**Критерий готовности:** Мессенджер работает идентично текущему, включая Realtime и Telegram-интеграцию.

---

### Этап 9: Настройки, шаблоны, база знаний

**Цель:** Все оставшиеся страницы работают.

**Задачи:**

9.1. Настройки workspace:
- Создать `app/(app)/workspaces/[workspaceId]/settings/page.tsx`
- Скопировать `src/pages/workspace-settings/` — 18 файлов:
  - `GeneralTab.tsx`, `RolesTab.tsx`, `StatusesTab.tsx`, `MembersTab.tsx`
  - `TemplatesTab.tsx`, `DirectoriesTab.tsx`, `IntegrationsTab.tsx`
  - `GoogleDriveTab.tsx`, `TelegramTab.tsx`, `AISettingsTab.tsx`
  - `KnowledgeBaseTab.tsx`, `AuditLogTab.tsx`, `QuickRepliesTab.tsx`
  - и другие
- Скопировать `src/components/directories/` — 21 файл

9.2. Шаблоны:
- Создать роуты для редакторов шаблонов (form, document-kit, project)
- Скопировать `src/components/templates/` — 81 файл
- Скопировать `src/components/projects/` — 73 файла

9.3. База знаний:
- Создать роуты для knowledge base
- Скопировать `src/pages/KnowledgeBasePage/`
- Скопировать `src/components/knowledge/` — 11 файлов
- Скопировать `src/hooks/knowledge/` — 6 файлов

9.4. Задачи (отдельная страница):
- Создать `app/(app)/workspaces/[workspaceId]/tasks/page.tsx`
- Скопировать `src/pages/TasksPage/`

9.5. Проверить: все страницы настроек открываются и работают.

**Критерий готовности:** 100% функционала текущего ClientCase доступно в новом проекте.

---

### Этап 10: Тестирование и переключение

**Цель:** Новый проект полностью заменяет старый.

**Задачи:**

10.1. Полное ручное тестирование:
- [ ] Авторизация (вход, выход, регистрация, OTP, Google)
- [ ] Workspace (создание, переключение, настройки)
- [ ] Проекты (создание, удаление, все вкладки)
- [ ] Документы (загрузка, перемещение, удаление, drag&drop)
- [ ] Формы (заполнение, автосохранение, composite fields)
- [ ] Мессенджер (отправка, реакции, вложения, Realtime)
- [ ] Задачи (создание, канбан, перемещение)
- [ ] Шаблоны (создание, редактирование, применение)
- [ ] AI-панель (чат, проверка документов)
- [ ] Inbox (список, прочитано/непрочитано)
- [ ] Google Drive интеграция
- [ ] Telegram-бот (входящие, исходящие)
- [ ] Мобильная адаптация

10.2. Перенести тесты:
- Скопировать все `.test.ts` файлы (~27 штук)
- Настроить Vitest для Next.js
- Все тесты должны проходить

10.3. Деплой на production:
- Настроить домен
- Настроить SSL
- Проверить production build

10.4. Переключение:
- Убедиться что всё работает на production
- Перенаправить `app.relostart.com` на новый проект (или настроить редирект)
- Отключить старый ClientCase

**Критерий готовности:** Старый ClientCase можно выключить, вся работа ведётся в новом проекте.

---

### Этап 11: Фундамент маркетплейса (приоритет 2)

**Цель:** Подготовить архитектуру для будущей биржи. НЕ реализовывать UI.

**Задачи:**

11.1. Создать заглушки публичных страниц:
- `app/(public)/layout.tsx` — layout без авторизации
- `app/(public)/lawyers/page.tsx` — placeholder «Каталог юристов — скоро»
- `app/(public)/blog/page.tsx` — placeholder «Блог — скоро»
- `app/(public)/about/page.tsx` — placeholder «О платформе — скоро»

11.2. Создать заглушки API Routes:
- `app/api/payments/route.ts` — placeholder для платёжных webhook'ов
- `app/api/webhooks/route.ts` — placeholder для внешних webhook'ов

11.3. Создать Supabase-клиент для серверных компонентов:
- `src/lib/supabase-server.ts` — для SSR и API Routes (с `@supabase/ssr`)

11.4. Подготовить middleware:
- Разделение публичных и приватных роутов
- Cookie-based auth для SSR

11.5. Подготовить SQL-миграции для новых таблиц (НЕ применять):
- `service_categories`
- `lawyer_profiles`
- `lawyer_services`
- `orders`
- `payments`
- `payouts`
- `reviews`
- `blog_posts`
- `blog_categories`
- `custom_domains`
- Сохранить в `supabase/migrations/` как готовые файлы

**Критерий готовности:** Структура проекта готова для добавления маркетплейса. Публичные страницы доступны (с заглушками). API Routes существуют. Миграции написаны.

---

## 6. Важные технические детали

### Supabase SSR

Next.js требует отдельную настройку Supabase для серверных и клиентских компонентов:

```
src/lib/supabase.ts         — клиентский (браузер), как сейчас
src/lib/supabase-server.ts  — серверный (SSR, API Routes), с @supabase/ssr
```

### "use client" директива

Добавить в начало КАЖДОГО файла, который использует:
- `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`
- `useRouter`, `useParams`, `useSearchParams` (из next/navigation)
- Любой кастомный хук
- `onClick`, `onChange` и другие event handlers
- `useContext`, `createContext`
- Zustand `useStore`
- React Query `useQuery`, `useMutation`

НЕ нужен `"use client"` для:
- Чистых TypeScript типов и интерфейсов
- Утилитарных функций без React
- Сервисных модулей (Supabase-запросы)
- Константы и конфигурации

### Замена React Router → Next.js Navigation

| React Router | Next.js | Где менять |
|-------------|---------|-----------|
| `import { useNavigate } from 'react-router-dom'` | `import { useRouter } from 'next/navigation'` | Все файлы с навигацией |
| `const navigate = useNavigate()` | `const router = useRouter()` | |
| `navigate('/path')` | `router.push('/path')` | |
| `navigate('/path', { replace: true })` | `router.replace('/path')` | |
| `navigate(-1)` | `router.back()` | |
| `import { Link } from 'react-router-dom'` | `import Link from 'next/link'` | |
| `<Link to="/path">` | `<Link href="/path">` | |
| `import { useParams } from 'react-router-dom'` | `import { useParams } from 'next/navigation'` | |
| `import { useSearchParams } from 'react-router-dom'` | `import { useSearchParams } from 'next/navigation'` | API немного отличается |
| `import { useLocation } from 'react-router-dom'` | `import { usePathname } from 'next/navigation'` | |
| `<Navigate to="/login" />` | `redirect('/login')` | Серверные компоненты |
| `<Outlet />` | `{children}` в layout.tsx | |

### Lazy Loading

Текущий `lazyWithRetry()` заменяется на Next.js `dynamic()`:
```tsx
// Было (Vite + React Router)
const ProjectPage = lazyWithRetry(() => import('./pages/ProjectPage'))

// Стало (Next.js)
import dynamic from 'next/dynamic'
const HeavyComponent = dynamic(() => import('./components/HeavyComponent'))
```

Страницы в `app/` автоматически code-split — дополнительный lazy loading не нужен.

---

## 7. Риски и митигация

| Риск | Вероятность | Митигация |
|------|------------|-----------|
| Tailwind 3 → 4 несовместимость | Средняя | Если проблемы — остаться на Tailwind 3, перейти позже |
| React 18 → 19 breaking changes | Низкая | React 19 обратно совместим с 18 |
| Supabase Realtime в Next.js | Низкая | Realtime работает на клиенте, `"use client"` достаточно |
| Сложности с middleware auth | Средняя | Использовать `@supabase/ssr` — официальная библиотека |
| Tiptap + Next.js конфликты | Низкая | Tiptap клиентский, `"use client"` + dynamic import |
| Дублирование env-переменных | Низкая | Скрипт для глобальной замены `VITE_` → `NEXT_PUBLIC_` |

---

## 8. Определение «готово»

### Приоритет 1 (перенос ClientCase) — готово когда:
- [ ] Все страницы текущего ClientCase доступны и работают
- [ ] Авторизация работает (email, OTP, Google)
- [ ] Мессенджер работает с Realtime
- [ ] Документы: загрузка, просмотр, перемещение, удаление
- [ ] Формы: заполнение, автосохранение
- [ ] Задачи: создание, канбан
- [ ] Шаблоны: создание, редактирование, применение
- [ ] AI-панель: чат, проверка документов
- [ ] Google Drive интеграция
- [ ] Telegram-бот работает
- [ ] Все тесты проходят
- [ ] Production деплой настроен
- [ ] Можно полностью отказаться от старого ClientCase

### Приоритет 2 (фундамент маркетплейса) — готово когда:
- [ ] Структура роутинга поддерживает публичные и приватные страницы
- [ ] Заглушки публичных страниц существуют
- [ ] API Routes для платежей/webhook'ов существуют (заглушки)
- [ ] Supabase SSR-клиент настроен
- [ ] SQL-миграции для таблиц маркетплейса написаны (не применены)
- [ ] Middleware для разделения auth/public настроен
