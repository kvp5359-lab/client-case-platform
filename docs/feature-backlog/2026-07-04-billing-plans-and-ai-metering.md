# Тарифы, лимиты и учёт токенов ИИ — план

Дата: 2026-07-04. Статус: Фаза 1 (фундамент БД) — в проде; Фазы 2-5 — по решениям владельца.

## Цель (со слов владельца)

- 2-3 **тарифа**, у каждого свой набор: включённые модули + числовые лимиты (проекты, задачи, пользователи, хранилище).
- **Учёт токенов нейросети на уровне воркспейса** — чтобы ограничивать и перепродавать.
- Возможность **включать/выключать модули** и задавать **объёмы сущностей** по тарифу.

## Что уже было (из аудита, до этого плана)

- `workspace_limits` — пер-воркспейс override'ы (участники/проекты/хранилище), лимиты **мягкие** (не блокируют).
- `get_workspace_usage_and_limits`, `workspace_at_limit`, `export_workspace_data` — RPC.
- `enabled_modules` (шаблон проекта) + `module_access` (роль) — гейтинг модулей **на уровне проекта**, не тарифа.
- UI «Использование и данные» (owner) в Настройках → Общие.

## Архитектура (слои)

```
plans (определения тарифов)  ──┐
                                ├─→ эффективный лимит = COALESCE(override, plan)
workspace_billing (ws → план) ─┘
workspace_limits (override'ы) ──┘

ai_usage_events (сырой лог)  ──trigger──→ ai_usage_monthly (rollup для быстрых квот)
```

## Фаза 1 — Фундамент БД ✅ (аддитивно, в проде)

**Таблицы:**
- `plans` — `code`, `name`, `price_monthly`, `currency`, лимиты (`max_participants/projects/tasks/storage_mb`, `ai_tokens_monthly`), `enabled_modules text[]`, `is_active`, `sort_order`.
- `workspace_billing` — `workspace_id PK`, `plan_id`, `status` (trial/active/past_due/canceled), `current_period_start/end`, `trial_ends_at`, `updated_at`.
- `ai_usage_events` — сырой лог: `workspace_id`, `occurred_at`, `function_name`, `provider`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `user_id`, `feature`, `meta`.
- `ai_usage_monthly` — rollup: `(workspace_id, period, model) PK`, суммы токенов + `request_count`.

**RPC:**
- `log_ai_usage(...)` — **service_role only**, вызывается edge-функциями. Пишет сырое событие + upsert rollup. Best-effort.
- `get_workspace_ai_usage(ws, period?)` — токены за месяц (для UI и квоты).
- `resolve_workspace_plan(ws)` — план + эффективные лимиты (override перебивает план).
- Расширить `get_workspace_usage_and_limits` — добавить `ai_tokens_used/included`.
- Расширить `workspace_at_limit(ws, kind)` — kind `ai_tokens`.

**Сид:** 3 черновых тарифа (Старт / Команда / Бизнес) — цифры-заглушки, владелец правит. Существующие воркспейсы → `business` (или без записи = безлимит), чтобы поведение НЕ изменилось.

## Фаза 2 — Учёт токенов (capture) 🟡 частично в проде, best-effort

**Готово и задеплоено (2026-07-04):**
- `_shared/logAiUsage.ts` — best-effort хелпер (никогда не бросает) + `anthropicUsage`/`geminiUsage`.
- `_shared/gemini-client.ts` — `callGeminiApi` получил необязательный колбэк `onUsage` (обратно совместимо) → централизованная точка usage для ВСЕХ Gemini-вызовов.
- Врезано + задеплоено: **`chat-with-messages`** (Claude+Gemini стримы, #1 потребитель) и **`generate-conversation-title`**. Учёт уже копится по ним.

**Осталось врезать (rollout, механически, best-effort):** `generate-project-digest`, `translate-message`, `translate-block`, `check-document`, `analyze-documents`, `generate-block`, `generate-document`, `generate-merge-name`, `extract-*`, `knowledge-index/search`, `transcribe-audio` (аудио — учёт в секундах). Anthropic-ветки — по паттерну `anthropicUsage(result)`; Gemini через `callGeminiApi({onUsage})` (уже готов); стримы — как в chat-with-messages.

### Исходный дизайн (для остального rollout)

**Дизайн:** новый `_shared/logAiUsage.ts` — `logAiUsage({service, workspaceId, functionName, provider, model, usage, feature})`. Вызов **обёрнут в try/catch и fire-and-forget** → сбой учёта НИКОГДА не ломает ответ ИИ (это делает деплой безопасным даже без смок-теста расхода).

**Точки врезки** (после ответа API, `usage`/`usageMetadata`):
- Anthropic (децентрализованно): `chat-with-messages`, `generate-conversation-title`, `generate-merge-name`, `extract-text`, `knowledge-search`, `check-document`, `_shared/ai-chat-setup.ts`, `_shared/knowledgeRag.ts`, `_shared/ai-extraction.ts`, `_shared/knowledgeIndexHelpers.ts`.
- Gemini (централизовать): врезка в `_shared/gemini-client.ts#callGeminiApi` (нужно протащить `workspaceId` в параметры — иначе одна точка не знает воркспейс).
- Аудио: `transcribe-audio` — учёт в секундах (иная модель тарификации).

⚠️ `_shared/ai-chat-setup.ts`, `gemini-client.ts` — карантин-смежные. Правки строго аддитивные, деплой всей AI-волны + проверка «после моего запроса в `ai_usage_events` появилась строка».

## Фаза 3 — Тарифы в UI (владелец воркспейса) ⏳

- Секция «Использование» показывает **план**, лимиты и **токены за месяц** (шкала).
- Владелец видит, к какому тарифу привязан; апгрейд — заявка/контакт (без онлайн-оплаты на MVP).

## Фаза 4 — Платформенная админка (супер-админ) ⏳ решение

Чтобы **тебе** назначать тарифы чужим воркспейсам и видеть их расход — нужна платформенная админ-панель (сейчас всё пер-воркспейс, супер-админа нет). Варианты: (а) отдельный роут `/admin` под флаг «платформенный владелец»; (б) на первое время — назначать план SQL'ом. MVP: (б).

## Фаза 5 — Жёсткое применение + оплата ⏳ решение

- **Жёсткие лимиты**: гейт в создании участника/проекта/задачи по `workspace_at_limit` + дружелюбный экран «лимит достигнут, апгрейд». Сейчас — мягко (показ).
- **Квота токенов**: при исчерпании — блок ИИ-функций или доплата за перерасход.
- **Оплата**: ручное выставление ИЛИ интеграция (ЮKassa/Stripe).

## Решения за владельцем (блокируют Фазы 3-5)

1. Состав планов (модули + цифры) — черновик в сиде, правь.
2. Лимиты жёсткие или мягкие.
3. Токены: включённая квота + доплата за перерасход, или только учёт.
4. Оплата: вручную или интеграция.

## Грабли

- Токены **нельзя посчитать задним числом** — учёт копить сразу после деплоя Фазы 2.
- Учёт токенов — только best-effort (try/catch), НИКОГДА не блокирует ответ ИИ.
- `gemini-client.ts`/`ai-chat-setup.ts` — карантин: аддитивно + смок.
- Эффективный лимит = `COALESCE(workspace_limits.override, plan.limit)` — держать в одной функции `resolve_workspace_plan`.
