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
- **Состояние**: React Query (серверное, query keys в `src/hooks/queryKeys/` — директория модулей + barrel `index.ts`) + Zustand (клиентское, `src/store/`).
- **Структура**: `src/page-components/` (тяжёлые компоненты страниц), `src/components/` (переиспользуемые по модулям), `src/components/ui/` (shadcn).
- **Публичная часть**: `src/app/(public)/` — заглушки для маркетплейса (lawyers, blog, about).

### Слои и направление зависимостей (правило — T1 аудита 2026-06-13)

Зависимости текут СВЕРХУ ВНИЗ. Нижние слои НЕ импортят верхние:

```
app/  →  page-components/  →  components/  →  hooks/ ─┐
                                                       ├→  services/ → lib/ → types/  (+ store/, contexts/)
```

- **Доменные типы, чистые предикаты, DTO — в нижнем слое** (`src/types/<domain>.ts`, `src/lib/`), НЕ в `components/`/`page-components/`. Если тип нужен и сервису/хуку, и компоненту — его дом `types/`, а UI-файл реэкспортит (примеры: `@/types/documents`, `@/types/forms`, `@/types/board`, `@/types/taskPanelTabs`). Так нижние слои переиспользуемы/тестируемы без захода в UI.
- **`services/`, `store/`, `hooks/` НЕ импортят из `components/`/`page-components/`** (даже `import type`). Нашёл такое — выноси общий тип/хелпер вниз + реэкспорт.
- **Хуки**: общие/кросс-фичевые — в `src/hooks/`; строго фиче-локальные можно colocate в `<feature>/hooks/`, но слой `hooks/` НЕ зависит от `components/`.
- **Кросс-фичевое UI** (фильтр-примитивы, общие контексты) — в `src/components/filters/`, `src/components/shared/`, не во внутренностях конкретной фичи.
- **Доступ к БД — через сервисы (T2 аудита, лечится постепенно).** Чтения/записи доменных сущностей — в `src/services/<module>`; хук = React Query + вызов сервиса; **`supabase.from/rpc` не звать прямо в `.tsx`-компоненте** (иначе компонент не протестировать без мока supabase в render-тесте, и нет единого места правки query-shape/ошибок при смене схемы). Не кампания — стягивать inline-`from` в сервисы органически при правках файла.
- **Известный остаток T1** (НЕ доделано, нужна сессия с UI-тестом): движок документов физически в двух слоях (`components/documents/` + `page-components/ProjectPage/components/Documents/`), и 7 файлов `components/` импортят внутренности `page-components/ProjectPage/`. См. [`docs/audit/2026-06-13-architecture-maintainability.md`](../../docs/audit/2026-06-13-architecture-maintainability.md) T1.
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

Минимум для запуска фронта — переменные основного приложения (первые три).
`NEXT_PUBLIC_MODULE_*` нужны только модулю «Подбор ВНЖ»; без них приложение
поднимется, но этот модуль упадёт при открытии. Шаблон — `.env.example`
(`cp .env.example .env.local`).

| Переменная | Описание | Обязательна |
|-----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase проекта | да |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Публичный anon ключ | да |
| `NEXT_PUBLIC_APP_NAME` | Имя приложения | да |
| `NEXT_PUBLIC_APP_VERSION` | Версия (для отображения) | нет |
| `NEXT_PUBLIC_MODULE_SUPABASE_URL` | URL внешней базы модуля ВНЖ (mig-modules) | для модуля ВНЖ |
| `NEXT_PUBLIC_MODULE_SUPABASE_ANON_KEY` | Anon-ключ базы модуля ВНЖ | для модуля ВНЖ |

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

Требуется **Node ≥22** (Dockerfile собирает на `node:22-alpine`; зафиксировано в
`package.json` → `engines`).

```bash
cp .env.example .env.local   # заполнить значениями Supabase-проекта (см. «Окружение»)
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

## Устойчивость и операции (источник правды БД, дрейф, деплой, алерты)

Введено 2026-07-04 для борьбы с двумя рисками: расхождением кода и боевой базы («дрейф») и ручными ошибками деплоя.

### Источник правды по БД + детектор дрейфа

- **`supabase/schema/schema-manifest.json`** — компактный отпечаток (хеши) функций, триггеров и политик RLS. Его сверяет детектор дрейфа.
- **RPC `_schema_function_manifest()`** (только service_role) — возвращает живой отпечаток функций прода (хеши, НЕ тела — тела содержат секреты).
- **`scripts/db-drift-check.mjs`** — сравнивает прод с эталоном:
  ```bash
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/db-drift-check.mjs        # отчёт
  node scripts/db-drift-check.mjs --strict     # код 1 при дрейфе (для CI-гейта)
  node scripts/db-drift-check.mjs --update      # обновить эталон под текущий прод
  ```
- **CI `.github/workflows/db-drift.yml`** — гоняет проверку ежедневно + на PR к миграциям. **Требует секрет `SUPABASE_SERVICE_ROLE_KEY`** (Settings → Secrets → Actions; URL берётся из существующего `NEXT_PUBLIC_SUPABASE_URL`). Не блокирует деплой — только сигналит.
- **Правило против дрейфа:** любое изменение функции БД — через файл-миграцию; после осознанного изменения запустить `--update` и закоммитить обновлённый манифест. Тогда дрейф ловится сразу, а не копится.

### Деплой Edge Functions без ручных ошибок

- **`scripts/deploy-edge.sh`** — деплой с автоматическим `--no-verify-jwt` там, где он нужен (список внутри, синхронизирован с матрицей авторизации `channels.md`):
  ```bash
  scripts/deploy-edge.sh telegram-send-message wazzup-send   # конкретные
  scripts/deploy-edge.sh --list-nojwt                        # что деплоится с флагом
  scripts/deploy-edge.sh --all                               # все (осторожно)
  ```
  Убирает класс ошибок «забыл флаг → 401 от шлюза». При добавлении нового вебхука/`*-send` — дописать в `NO_JWT_FUNCTIONS` в скрипте.

### Алерты о сбоях в Telegram

- **pg_cron `platform-alerts`** (каждые 10 мин) → `run_platform_alerts()` шлёт владельцу в Telegram, если появились новые провалы отправки (`message_send_failures`) или падения крона.
- **Настройка (пока «спит»):** заполнить singleton-строку `platform_alert_config` (через MCP/SQL как service_role):
  ```sql
  UPDATE public.platform_alert_config
  SET enabled=true, bot_token='<токен любого бота>', chat_id='<твой numeric Telegram id>'
  WHERE id=1;
  ```
  `bot_token` — токен любого Telegram-бота (владелец должен разово написать этому боту в личку). `chat_id` — числовой id владельца. Пока `enabled=false` или поля пусты — алерты не шлются.

### Здоровье каналов (read-only, безопасно)

- **`scripts/channel-health.mjs`** — проверяет БЕЗ отправки сообщений: застрявшие исходящие (`pending` >15 мин), незакрытые `message_send_failures`, просроченный Gmail watch у активных ящиков, число MTProto-сессий.
  ```bash
  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/channel-health.mjs
  ```
  Гоняется в CI `Ops Checks` ежедневно рядом с детектором дрейфа.
- **Send-смок** (реальная отправка по каналу) сюда НЕ входит — рискует задеть клиентов. Проводит владелец вручную на выделенном тест-чате (см. `docs/deploy-backlog.md`).

### Смок-тест каналов (send-тест, требует настройки владельцем)

- **`scripts/smoke-channels.mjs`** — отправляет РЕАЛЬНОЕ тестовое сообщение в каждый тред из allowlist `smoke_test_threads` и проверяет доставку (`send_status='sent'`).
- **Двойная защита от отправки клиенту:** (1) RPC `smoke_send_test` на сервере отклоняет треды вне allowlist; (2) скрипт требует `--confirm` и печатает цели. Пустой allowlist → ничего не шлёт.
- **Настройка (владелец, один раз):** создать ТЕСТОВЫЙ воркспейс/треды на тест-чатах каждого канала → `INSERT INTO smoke_test_threads (thread_id, channel, note) VALUES ('<uuid>','telegram_group','тест');` Только тестовые чаты, НИКОГДА клиентские.
- Запуск: `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/smoke-channels.mjs --confirm`.
