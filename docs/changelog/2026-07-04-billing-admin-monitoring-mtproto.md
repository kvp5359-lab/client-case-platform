# 2026-07-04 — Тарифы/лимиты/учёт токенов, админка платформы, мониторинг, деплой mtproto

## Что сделано

Три блока: (1) фундамент биллинга — тарифы, лимиты по плану, учёт токенов ИИ,
жёсткие лимиты и админка платформы; (2) мониторинг — Sentry (отлов ошибок);
(3) деплой накопленных правок mtproto + фикс healthcheck.

План биллинга — [`docs/feature-backlog/2026-07-04-billing-plans-and-ai-metering.md`](../feature-backlog/2026-07-04-billing-plans-and-ai-metering.md).

## Биллинг (в проде через MCP + миграции в репо)

### Фундамент

- `plans` — тарифы (3 черновых: Старт/Команда/Бизнес, цифры-заглушки) с лимитами
  (участники/проекты/задачи/хранилище/`ai_tokens_monthly`) и `enabled_modules`.
- `workspace_billing` — привязка воркспейса к тарифу (нет строки = безлимит, как раньше).
- `ai_usage_events` (сырой лог) + `ai_usage_monthly` (rollup) — учёт токенов на воркспейс.
- RPC: `log_ai_usage` (service_role), `get_workspace_ai_usage`, `resolve_workspace_plan`;
  `get_workspace_usage_and_limits`/`workspace_at_limit` расширены планом+токенами.
- Эффективный лимит = `COALESCE(workspace_limits.override, plan.limit)`.
- Миграции `20260704160000_billing_plans_and_ai_metering.sql`,
  `20260704180000_billing_participants_count_team_seats.sql`.

### Учёт токенов ИИ (best-effort, задеплоено)

- `_shared/logAiUsage.ts` — хелпер, никогда не бросает (учёт не влияет на ответ ИИ).
- `gemini-client.ts` — `callGeminiApi(onUsage)` — центральная точка usage для Gemini.
- Врезано и задеплоено: `chat-with-messages` (Claude+Gemini стримы) и
  `generate-conversation-title`. Остальные ИИ-функции — по rollout (см. план).
- Проверено на проде: `log_ai_usage` пишет событие + агрегирует rollup (`ON CONFLICT`).

### Жёсткие лимиты + предупреждение 95%

- `LimitWarningBanner` вверху воркспейса при ≥95% (участники/проекты/хранилище/токены).
- Гейт лимита проектов в `CreateProjectDialog`.
- Квота токенов: `chat-with-messages` при исчерпании → 402 + понятный текст.
- `useWorkspaceLimitStatus` — производный статус лимитов.
- **Семантика «участники» = места команды** (participants с `user_id`), НЕ контакты:
  контакты создаются автоматикой из входящих — их нельзя лимитировать, иначе приём
  сообщений упрётся в лимит.

### Админка платформы

- `platform_admins` + `is_platform_admin()` (сид: владелец платформы).
- RPC `admin_list_workspaces` / `admin_set_workspace_plan` (guard `is_platform_admin`).
- Роут `/admin`: список воркспейсов (тариф/участники/проекты/хранилище/токены),
  смена тарифа. Доступ enforced на сервере, фронт-гейт для UX.
- Миграция `20260704170000_platform_admin.sql`.

### UI

- Секция «Использование» (Настройки → Общие) показывает тариф + токены за месяц.

## Мониторинг — Sentry (отлов ошибок)

- `instrumentation-client.ts` / `instrumentation.ts` — init без трасс и replay
  (приватность переписки), enabled только в production.
- `next.config.ts` — `withSentryConfig`, source-map upload выключен (без auth-токена).
- `logger.error` → `Sentry.captureException` в production.

## mtproto — деплой + healthcheck

- Задеплоена накопленная правка `commands.ts` (per-file `telegram_message_id` при
  отправке вложений) + аддитивная миграция `20260701205000_message_attachments_external_ids.sql`.
- Healthcheck контейнера: `wget` по `127.0.0.1`, НЕ `localhost` (в alpine localhost →
  IPv6 `::1`, Fastify слушает IPv4 → ложный «unhealthy»). Контейнер `Up (healthy)`.
- Подробности — [`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md) (запись 2026-07-04).

## Проверки

- tsc/eslint 0 по изменённым файлам, **819 тестов** зелёные.
- БД применена в прод через MCP, edge-функции задеплоены, mtproto — rsync+rebuild на VPS.

## Осталось (по плану)

- Квота токенов + учёт в остальных ИИ-функциях (rollout Фазы 2).
- Гейт создания участника команды (invite-флоу).
- Оплата (интеграция) — когда владелец решит.
- Финальный состав тарифов (цифры-заглушки правятся владельцем).
