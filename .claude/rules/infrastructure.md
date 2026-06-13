# ClientCase Platform — Infrastructure

Стек, развёртывание, операции с Supabase. Модель данных и фичи — в [`data-model.md`](./data-model.md). Мессенджер-каналы — в [`channels.md`](./channels.md). Ловушки — в [`gotchas.md`](./gotchas.md).

## Git workflow

**Работаем напрямую в `main`** — без feature-веток по умолчанию. Не предлагать создание ветки под задачу, если пользователь явно не попросил. Коммиты — по логическим блокам (отдельный коммит на смысловое изменение).

Перед любым рефакторингом — `git status`; есть незакоммиченное → предупредить и предложить закоммитить.

`git push` — **только после явного «да»** каждый раз.

## Документация и трекинг

| Что | Куда смотреть |
|-----|---------------|
| Баги | [`docs/bugs/`](../../docs/bugs/) — индекс [`README.md`](../../docs/bugs/README.md). Open / resolved. **При жалобе на странное поведение — сначала туда.** |
| Тесты — что покрыто, что нет, план | [`docs/testing-backlog.md`](../../docs/testing-backlog.md). **Перед добавлением новых тестов — туда.** |
| Changelog по дням | [`docs/changelog/`](../../docs/changelog/) — формат `YYYY-MM-DD-краткое-описание.md`. Не источник правды по инфре (для этого — `.claude/rules/`), но история «что когда делали». |
| Будущие фичи | [`docs/feature-backlog/`](../../docs/feature-backlog/) — планы по фичам и рефакторингам. |

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
| Формы | — | Нативные `useState`. `react-hook-form` и `zod` **удалены из зависимостей** (легаси, не использовались) (см. [`gotchas.md`](./gotchas.md#формы)). |
| Tiptap | 3.x | Rich text editor |
| @dnd-kit | latest | Drag & drop |
| Supabase JS | 2.x | БД, Auth, Storage, Realtime |
| Vitest | 4.x | Тесты (~640 кейсов) |

## Архитектура

- **Фронтенд**: Next.js App Router. Клиент в `src/`, страницы и layout — в `src/app/`.
- **Бэкенд**: Supabase (PostgreSQL + Auth + Storage + Realtime + Edge Functions).
- **Стилизация**: Tailwind 3 + CSS Variables (HSL) + shadcn/ui.
- **Состояние**: React Query (серверное, query keys в `src/hooks/queryKeys.ts`) + Zustand (клиентское, `src/store/`).
- **Структура**: `src/page-components/` (тяжёлые компоненты страниц), `src/components/` (переиспользуемые по модулям), `src/components/ui/` (shadcn).
- **Публичная часть**: `src/app/(public)/` — заглушки для маркетплейса (lawyers, blog, about).
- **Приватная часть**: `src/app/(app)/` — защищена цепочкой middleware (`src/proxy.ts`, см. [`gotchas.md`](./gotchas.md#файл-middleware--srcproxyts-не-middlewarets)) → server-side `(app)/layout.tsx` → клиентский `ProtectedRoute` → RLS в БД.

## Supabase

- **Project ref**: `zjatohckcpiqmxkmfxbs`
- **URL**: `https://zjatohckcpiqmxkmfxbs.supabase.co`
- **SSR клиент**: [`src/lib/supabase-server.ts`](../../src/lib/supabase-server.ts)
- **Браузерный**: [`src/lib/supabase.ts`](../../src/lib/supabase.ts)
- Общая БД с оригинальным ClientCase.

### Миграции

```bash
supabase db push --project-ref zjatohckcpiqmxkmfxbs
```

Миграции в `supabase/migrations/`. Идемпотентны (по возможности). После изменения схемы — регенерация типов:

```bash
supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts
```

### Edge Functions

- Исходники: `supabase/functions/` — ~87 функций + `_shared/` + `types/deno.d.ts` + `tsconfig.json`.
- Конфиг: `supabase/config.toml` (локальная разработка).
- **Перенесены из старого репо `ClientCase` 2026-04-18** (`feat/migrate-edge-functions`, коммит `c03f0dc`). Скачаны через `supabase functions download` — исходники в репо ровно соответствуют тому, что задеплоено в проде. Старый репо `ClientCase` как источник правды больше не используется.

**Деплой одной функции**:
```bash
supabase functions deploy <name> --project-ref zjatohckcpiqmxkmfxbs
```

**`--no-verify-jwt`** — обязателен для webhook'ов и `*-send` функций (вызываются без пользовательского JWT). См. [`gotchas.md`](./gotchas.md#--no-verify-jwt-для-webhook-и--send).

**Секреты (env vars)**:
```bash
supabase secrets set KEY=value --project-ref zjatohckcpiqmxkmfxbs
supabase secrets list --project-ref zjatohckcpiqmxkmfxbs   # значения не показывает
```

**Логи функции**:
```bash
supabase functions logs <name> --project-ref zjatohckcpiqmxkmfxbs
```

**Категории функций** (на 2026-05-24, ~87 шт) — мессенджер-функции в [`channels.md`](./channels.md). Прочие:
- **Google**: `google-oauth-start/exchange/refresh`, `google-drive-*` (8), `google-sheets-*` (2), `google-docs-export`.
- **AI**: `chat-with-messages`, `chat-with-documents`, `chat-with-uploaded-file`, `generate-block`, `generate-document`, `generate-merge-name`, `generate-conversation-title`, `generate-project-digest`, `translate-block`, `analyze-documents`, `extract-text`, `extract-placeholders`, `extract-form-data*`, `transcribe-audio`, `knowledge-index`, `knowledge-search`, `check-document`, `test-ai-connection`.
- **Документы/файлы**: `compress-document`, `compress-pdf`, `compress-pdf-ilovepdf`, `fetch-image`, `fetch-sheets`, `fix-cyrillic-storage-paths`, `export-to-drive`.
- **Impersonation**: `impersonate-start`, `impersonate-end` (см. [`data-model.md`](./data-model.md#импersonация--войти-под-пользователем-read-only)).
- **Sandbox**: `sandbox-test` — dev playground.

### pg_cron и service_role_key

См. [`gotchas.md`](./gotchas.md#pg_cron--service_role_key-ключ-зашит-в-команду-крона) — там полный разбор:
- Где брать ключ (новый формат `sb_secret_...`, не легаси JWT).
- Как обновлять команду крона.
- Диагностика.
- Конкретный пример с `gmail-watch-refresh` (продление Gmail watch — 7 дней).

### Отладка Edge Functions

**Проверить ответы pg_net** (исходящие http из триггеров — телега/wazzup/email):
```sql
SELECT id, status_code, content::text
FROM net._http_response
ORDER BY id DESC LIMIT 10;
```

**Различать 401**:
- **От шлюза Supabase**: тело пустое или generic → redeploy функции с `--no-verify-jwt`.
- **От нашего кода** (`{"error":"Unauthorized"}`): проверить `INTERNAL_FUNCTION_SECRET`/`x-internal-secret` (см. [`gotchas.md`](./gotchas.md#internal_function_secret--x-internal-secret)).

## mtproto-service

`mtproto-service/` — отдельный Node 20 сервис на Fastify + gramjs. Держит MTProto-сессии сотрудников (TG «как личный аккаунт»: реакции в обе стороны, read-receipts, online presence, typing). **Только private chats**; групповые — на бот-секретаре.

- **Доступ**: только через Edge Function `telegram-mtproto-*` (JWT + права) → mtproto-service с `x-internal-secret`. **Никогда не доступен из браузера напрямую.**
- **Деплой**: **ручной**, НЕ через CI/CD (`deploy.yml` его не выкатывает — `git push` mtproto не трогает). `/opt/clientcase/` на VPS — **не git-репо**; код `mtproto-service/` доставляется **rsync'ом** с локалки, образ собирается **локально на VPS** (`docker-compose.yml` → `build: ./mtproto-service`, не pull). Контейнер `clientcase-mtproto` (порт 3007). На VPS свой `mtproto-service/.env` с секретами — **не перезатирать**.
  ```bash
  # 1. С локалки — синхронизировать код (БЕЗ .env / node_modules / dist):
  rsync -av --delete --exclude node_modules --exclude dist --exclude .env \
    ./mtproto-service/ vps:/opt/clientcase/mtproto-service/
  # 2. На VPS — пересобрать и поднять только mtproto:
  ssh vps 'cd /opt/clientcase && docker compose build mtproto && docker compose up -d mtproto'
  ```
  Простой — пара секунд; сессии переподнимаются из БД (`bootstrapAllSessions`). `app-blue/green` не затрагиваются.
- **Локально**:
  ```bash
  cd mtproto-service
  npm install
  cp .env.example .env
  # Env: TELEGRAM_API_ID, TELEGRAM_API_HASH (my.telegram.org/apps),
  #      MTPROTO_SESSION_ENCRYPTION_KEY (openssl rand -hex 32),
  #      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  #      INTERNAL_SECRET (тот же, что у Edge Functions)
  npm run dev          # tsx watch
  npm run build        # tsc
  npm run typecheck
  ```
- **Endpoints**: все требуют `x-internal-secret`. См. `mtproto-service/README.md`.
- **Зона карантина** — менять только по явной просьбе, со смок-тестом.

## Окружение

| Переменная | Описание |
|-----------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публичный anon ключ |
| `NEXT_PUBLIC_APP_NAME` | Имя приложения |

## Деплой

- **Репозиторий**: https://github.com/kvp5359-lab/client-case-platform
- **CI/CD**: GitHub Actions — build Docker → push GHCR → deploy на VPS via SSH.
- **Workflow**: `.github/workflows/deploy.yml` (push в main или manual dispatch).

### VPS (продакшен)

- **IP**: `72.61.82.244` (hostname `srv1255608`)
- **SSH**: `ssh vps` (конфиг в `~/.ssh/config`, ключ `~/.ssh/id_ed25519`)
- **Путь**: `/opt/clientcase/`
- **Docker-образ**: `ghcr.io/kvp5359-lab/client-case-platform:latest`
- **Docker-сеть**: `relostart_web` (общая с nginx и другими сервисами).
- **Blue/green** (с 2026-04-27): два контейнера `clientcase-app-blue` (3005) и `clientcase-app-green` (3006) + `clientcase-mtproto` (3007). В каждый момент времени запущен только один цвет (другой выключен между деплоями). Деплой поднимает противоположный цвет, ждёт ответ 200/302/307, переключает nginx upstream, гасит старый. Если новый не поднялся — старый живой, деплой падает. Никаких 502 во время деплоя.
- **`docker-compose.yml`** в корне репо — зеркало `/opt/clientcase/docker-compose.yml` на VPS (там описаны оба цвета + mtproto). Для локального запуска используй `npm run dev`, не compose.

### Nginx (reverse proxy)

- **Контейнер**: `relostart-nginx` (из `/opt/relostart/`)
- **Два домена — два конфига**:
  - `/opt/relostart/nginx/conf.d/app-relostart.conf` — `app.relostart.com`
  - `/opt/relostart/nginx/conf.d/clientcase-kvp.conf` — `clientcase.kvp-projects.com`
- **Upstream-файл**: `/opt/relostart/nginx/conf.d/clientcase-upstream.conf` — единый `upstream clientcase { server clientcase-app-<color>:3000; ... }`. **Управляется деплой-скриптом, руками не править.** Скрипт переписывает при blue/green переключении.
- **SSL**: Let's Encrypt (контейнер `relostart-certbot`).
- **Жирные буферы прокси** — обязательны на обоих конфигах. См. [`gotchas.md`](./gotchas.md#nginx-буферы-при-добавлении-нового-домена).

### Другие контейнеры на VPS

| Контейнер | Порт | Назначение |
|-----------|------|-----------|
| `relostart-app` | 3000 | Основной Relostart |
| `relostart-app-dev` | 3001 | Relostart dev |
| `migcases-app-dev` | 3002 | MigCases dev |
| `kb-frontend` | 3003 | Knowledge Base frontend |
| `migcases-app-prod` | 3004 | MigCases prod |
| `clientcase-app-blue` | 3005 | **ClientCase blue** (blue/green) |
| `clientcase-app-green` | 3006 | **ClientCase green** (blue/green) |
| `kb-backend` | 8000 | Knowledge Base API |
| `kb-qdrant` | 6333 | Qdrant vector DB |

## Локальная разработка

```bash
npm install
npm run dev          # http://localhost:8080 (Webpack, не Turbopack — см. gotchas)
npm run build        # production build
npm run lint         # ESLint, --max-warnings 0
npm test             # Vitest run (~640 кейсов)
npm run test:watch   # Vitest watch
npm test -- path/to/file.test.ts   # один файл
npm test -- -t "имя теста"         # один кейс
npm run test:coverage
```
