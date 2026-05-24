# Миграция Edge Functions: `_shared/cors.ts` → `_shared/edge.ts`

**Статус:** не сделано, требует отдельной волны со смок-тестами.
**Дата заведения:** 2026-05-24.

## Контекст

Исторически edge functions использовали `_shared/cors.ts` (даёт только
`getCorsHeaders(req)`). Новый модуль `_shared/edge.ts` (создан позже)
объединяет CORS + JSON-ответы + service-клиент + проверку секрета:

- `jsonRes(payload, status, req)` вместо `new Response(JSON.stringify(...), { headers })`
- `preflight(req)` вместо ручного OPTIONS-обработчика
- `getServiceClient()` вместо `createClient(SUPABASE_URL, ...)`
- `getUserClient(req)` / `getUser(req)`
- `requireInternalSecret(req)` для проверки `x-internal-secret`
- Константы `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_FUNCTION_SECRET`

## Что осталось мигрировать

~73 функции, кроме карантинных (telegram-*, wazzup-*, gmail-*, email-*, mtproto-*)
и `provision-*`, `impersonate-*`, `fetch-telegram-avatar`. Карантин — отдельным заходом
со смок-тестами по правилам в `.claude/rules/refactoring.md`.

Кандидаты на первый прогон (не-карантин, используют `_shared/cors.ts`):

- analyze-documents, check-document, compress-document, compress-pdf*, export-to-drive
- extract-*, fetch-image, fetch-sheets, fix-cyrillic-storage-paths
- generate-*, knowledge-index, knowledge-search
- google-calendar-* (кроме callback — HTML), google-drive-* (кроме callback — HTML), google-docs-export, google-oauth-*, google-sheets-*
- chat-with-* (это AI чат, не мессенджер)
- log-send-failure, sandbox-test, set-participant-access, test-ai-connection, transcribe-audio, translate-*

## Что НЕ мигрировать (особые случаи)

- `google-calendar-callback`, `google-drive-callback` — возвращают HTML с postMessage,
  CORS не нужен (это не XHR, а browser navigation).
- Карантин: `telegram-*`, `wazzup-*`, `gmail-*`, `email-*`, `mtproto-*` — только
  по явному разрешению + смок-тест.

## Метод миграции (per function)

1. Заменить шапку:
   ```ts
   import { getCorsHeaders } from '../_shared/cors.ts'
   // на
   import { jsonRes, preflight, getServiceClient } from '../_shared/edge.ts'
   ```
2. `if (req.method === 'OPTIONS') return new Response(null, { headers: getCorsHeaders(req) })`
   → `if (req.method === 'OPTIONS') return preflight(req)`
3. `new Response(JSON.stringify(data), { status, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } })`
   → `jsonRes(data, status, req)`
4. Удалить хардкод `SUPABASE_URL = 'https://...'` — взять из `edge.ts` экспорта.
5. `createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)` → `getServiceClient()`.

## Профит миграции

- Снимает ~5-15 строк бойлерплейта на функцию (~250-1000 строк суммарно).
- Один источник правды для CORS-whitelist (сейчас `_shared/cors.ts` тоже это даёт).
- Единый паттерн для нового разработчика.

## Риски

- Каждая функция → отдельный deploy + smoke test.
- Карантинные edge functions с привязкой к мессенджеру/email — повышенный риск (см. `gotchas.md`).
- Sandbox-test (единственный реальный wildcard-копипастер) — dev playground, потеря не критична.
