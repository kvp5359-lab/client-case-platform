# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Главные источники правды

**Сначала** читать эти два файла — там детальный контракт инфраструктуры и зон рефакторинга:

- [.claude/rules/infrastructure.md](.claude/rules/infrastructure.md) — стек, архитектура, Supabase, Edge Functions, мессенджер-каналы (TG/Wazzup/Email/MTProto), RLS-нюансы, деплой на VPS, blue/green nginx, миграции, известные ловушки. **Без чтения соответствующего раздела не давать советов по деплою/инфре/каналам.**
- [.claude/rules/refactoring.md](.claude/rules/refactoring.md) — 10 зон аудита + список карантинных зон (мессенджер/email/mtproto), которые при «полном аудите» **пропускаются**.

Баг-лог: [docs/bugs/README.md](docs/bugs/README.md) (open/resolved). При жалобе на странное поведение — сначала туда.
Тестовый бэклог: [docs/testing-backlog.md](docs/testing-backlog.md).

## Команды

```bash
npm install
npm run dev          # http://localhost:8080 — Next 16 на Webpack (НЕ Turbopack, см. ниже)
npm run build
npm run lint         # eslint --max-warnings 0
npm test             # vitest run (620+ кейсов)
npm run test:watch
npm test -- path/to/file.test.ts        # один файл
npm test -- -t "имя теста"              # один кейс
```

**Dev-сервер намеренно на Webpack** (`--webpack` в `package.json`). Turbopack в Next 16.2.2 на этом проекте раздувал кеш до 2.5+ ГБ и зависал HMR. Не возвращать без причины. Если dev завис: `pkill -f "next dev"; rm -rf .next tsconfig.tsbuildinfo`.

## Git workflow

Работаем **напрямую в `main`**. Feature-ветки не создавать без явной просьбы. Коммиты — по логическим блокам (отдельный коммит на смысловое изменение). `git push` — только после явного «да» каждый раз.

Перед любым рефакторингом — `git status`; если есть незакоммиченное, предупредить и предложить закоммитить.

## Архитектура — big picture

**Next.js 16 App Router** (`src/app/`) + **Supabase** (Postgres + Auth + Storage + Realtime + Edge Functions). 62 роута, фронт + бэк в одном репо, миграции в `supabase/migrations/`.

- `src/app/(public)/` — публичные страницы (lawyers/blog/about/privacy/terms).
- `src/app/(app)/` — приватные. Защита: middleware `src/proxy.ts` (новое имя в Next 16, не `middleware.ts`) → server-side `(app)/layout.tsx` → `ProtectedRoute` → RLS в БД.
- `src/page-components/` — тяжёлые компоненты страниц, `src/components/` — переиспользуемые по модулям, `src/components/ui/` — shadcn.
- Состояние: **React Query** (серверное, ключи централизованы в `src/hooks/queryKeys.ts`) + **Zustand** (клиентское, `src/store/`).
- Формы — нативный `useState`. **Ни `react-hook-form`, ни `zod`** в реальных формах не используются (исторически были в шаблонах).

### Единая модель «трэд»

`project_threads` — общая таблица для **задач, чатов и писем** (`type ∈ {task, chat, email}`). Все три ходят через одну RPC `get_workspace_threads` и одну вкладочную панель `TaskPanel`. При любой работе с задачами/чатами/почтой смотреть `project_threads`, а не искать отдельные сущности.

Личные диалоги (TG Business / Wazzup / личная почта) лежат как треды **без `project_id`** с `owner_user_id`. Системных инбокс-проектов больше нет — паттерн «создать фейковый проект под личные диалоги» **устаревший**, не использовать.

### Мессенджер — карантин

Edge Functions `telegram-*`, `wazzup-*`, `gmail-*`, `_shared/` хелперы и фронтовая папка `src/components/messenger/` — карантинная зона. Любая «оптимизация» там исторически ломала переписку (3+ инцидента с RLS на `project_threads`). Трогать только по явной просьбе и со смок-тестом.

Конкретные ловушки описаны в `infrastructure.md`:
- RLS `project_threads_select` обязан содержать short-circuit `created_by = auth.uid()` ИНАЧЕ `INSERT…RETURNING` ломается (баг ловили 3 раза).
- Дедуп Telegram-сообщений между несколькими ботами в одной группе — через content-UNIQUE, а не `message_id`.
- `--no-verify-jwt` обязателен для webhook-функций и `*-send` (вызываются триггером pg_net без JWT).
- `INTERNAL_FUNCTION_SECRET` должен совпадать между секретами Supabase и заголовком триггера, иначе все исходящие 401.

### Send-status (исходящие сообщения)

Единый источник правды для UI и тостов — `project_messages.send_status` (`pending`/`sent`/`failed`). **Авторетраев нет** — повтор только по кнопке от юзера. При добавлении нового канала — обязательно `markMessageSent` / `markMessageFailed` из `_shared/messageSendStatus.ts`.

### Права

Два независимых слоя на проекте:
1. `project_templates.enabled_modules` — какие модули в принципе включены.
2. `project_roles.module_access` — для каждой проектной роли доступ к модулю.

Модуль видим если `enabled_modules.includes(m) AND hasModuleAccess(m)`. Резолв — `useProjectPermissions.hasModuleAccess()`. **Не проверять права на глаз в JSX** — только через хук.

### Корзина

`projects.is_deleted` и `project_threads.is_deleted` (soft delete). Все RPC (`get_user_projects`, `get_workspace_threads`, `get_sidebar_data`, `get_my_urgent_tasks_count`) фильтруют `is_deleted=false`. Физическое удаление — только из UI «Корзина» в настройках воркспейса.

### Supabase

- Project ref: `zjatohckcpiqmxkmfxbs`. URL: `https://zjatohckcpiqmxkmfxbs.supabase.co`.
- SSR клиент: `src/lib/supabase-server.ts`. Браузерный: `src/lib/supabase.ts`.
- Деплой Edge Function: `supabase functions deploy <name> --project-ref zjatohckcpiqmxkmfxbs` (для webhook'ов и `*-send` — `--no-verify-jwt`).
- Миграции: `supabase db push --project-ref zjatohckcpiqmxkmfxbs`.
- Регенерация типов: `supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts`.

### Деплой

GitHub Actions → build Docker → push GHCR → SSH на VPS `srv1255608` (`ssh vps`, путь `/opt/clientcase/`). **Blue/green** на портах 3005/3006 за nginx (`relostart-nginx`). Деплой-скрипт сам переписывает `/opt/relostart/nginx/conf.d/clientcase-upstream.conf` — руками не править. При добавлении нового домена не забыть скопировать жирные `proxy_buffer_size 256k; proxy_buffers 8 512k` — иначе 502 на залогиненных запросах.

## mtproto-service (отдельный Node-сервис)

`mtproto-service/` — Fastify + gramjs, держит MTProto-сессии сотрудников (Telegram «как личный аккаунт»: реакции в обе стороны, read-receipts, online presence). **Никогда не доступен из браузера напрямую** — фронт идёт через Edge Function `telegram-mtproto-*`, та проксирует с `x-internal-secret`. Зона ответственности — только private chats; групповые остаются на бот-секретаре.

- Локально: `cd mtproto-service && npm install && cp .env.example .env && npm run dev`. Env: `TELEGRAM_API_ID/HASH` (my.telegram.org/apps), `MTPROTO_SESSION_ENCRYPTION_KEY` (`openssl rand -hex 32`), `SUPABASE_URL/SERVICE_ROLE_KEY`, `INTERNAL_SECRET` (тот же, что в Edge Functions).
- Build/typecheck: `npm run build`, `npm run typecheck`.
- Деплой — отдельный Docker-контейнер на том же VPS (см. `mtproto-service/Dockerfile` и `README.md` рядом).
- Зона **карантинная** — трогать только по явной просьбе, со смок-тестом (auth flow + входящее/исходящее + реакция + backfill).

## Edge Functions — отладка

```bash
# Логи функции в реальном времени (или последние N)
supabase functions logs <name> --project-ref zjatohckcpiqmxkmfxbs

# Список секретов (значения не показывает)
supabase secrets list --project-ref zjatohckcpiqmxkmfxbs

# Установить/переустановить секрет (если функция «не видит» — переустановить тем же значением)
supabase secrets set KEY=value --project-ref zjatohckcpiqmxkmfxbs

# Проверить ответы pg_net (исходящие http из триггеров — телега/wazzup/email)
# В SQL Editor:
#   SELECT id, status_code, content::text FROM net._http_response ORDER BY id DESC LIMIT 10;
```

При 401 от webhook-функции — это шлюз Supabase отбил до нашего кода → нужен redeploy с `--no-verify-jwt`. При 401 с телом `{"error":"Unauthorized"}` — это уже наш код, проверять `INTERNAL_FUNCTION_SECRET`/`x-internal-secret`.

## Стиль общения и отладки (глобальное, важное)

- Русский язык. Ответы максимально короткие, без воды. Двухуровневые: сначала краткий обзор, детали — по запросу.
- Юзер не программист — без жаргона, простым языком.
- **При баге не гадать — измерять**: ставить временные `console.log` с метками времени, просить воспроизвести, по логам устанавливать последовательность, потом один точечный фикс, потом убрать логи. После 3-й неудачной попытки — `WebSearch`. После 6-й — сравнить минимум 3 гипотезы с подтверждением из интернета/кода.
- Указывать источник информации (🌐/📁/💬/📝/🧠 и т.д.).

## Permissions checklist для PR-задач

- [ ] Проверил `git status` перед массовыми правками.
- [ ] Если трогаю мессенджер/email/mtproto — прочитал соответствующий раздел `infrastructure.md`.
- [ ] Если менял RLS на `project_threads` — сохранил short-circuit `created_by = auth.uid()`.
- [ ] Если добавил Edge Function на webhook или `*-send` — задеплоил с `--no-verify-jwt`.
- [ ] Если изменил BD-схему — обновил `src/types/database.ts` через `supabase gen types`.
- [ ] Если добавил мутацию данных — инвалидировал релевантные query keys из `queryKeys.ts`.
- [ ] `npm run lint && npm test` зелёные.
- [ ] Не пушил без явного «да».
