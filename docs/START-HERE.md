# 🧭 START HERE — вход в проект за 30 минут

> Ты новый в этом проекте (человек или AI-ассистент)? Прочитай это — дальше
> будешь знать, куда смотреть и чего НЕ трогать. Цель документа — чтобы проект
> не жил «в голове одного человека».

## Что это

**ClientCase** — платформа управления клиентскими делами (CRM + мессенджер +
документы + база знаний). Продакшн — Next-приложение на VPS (blue/green),
бэкенд — Supabase (Postgres + Auth + Storage + Edge Functions) + отдельный
mtproto-сервис. **Рабочий репозиторий — только `client-case-platform`.** Репо
`ClientCase/` (vite) — легаси, НЕ трогать.

## Стек (кратко)

Next 16 (App Router, Webpack — **не Turbopack**) · React 19 · TypeScript strict ·
Tailwind 3 · React Query (серверное состояние) · Zustand (клиентское) ·
Supabase JS · Vitest. Node ≥ 22.

## Запустить локально

```bash
cp .env.example .env.local   # заполнить Supabase-значениями (см. infrastructure.md)
npm install
npm run dev                  # http://localhost:8080
npm run lint && npm test     # перед сдачей — оба зелёные
```

## Карта: куда смотреть

| Нужно | Файл |
|-------|------|
| **Инфраструктура, деплой, VPS, Supabase-операции** | [`.claude/rules/infrastructure.md`](../.claude/rules/infrastructure.md) |
| **Модель данных и фичи** (треды, корзина, права, календарь…) | [`.claude/rules/data-model.md`](../.claude/rules/data-model.md) |
| **🔴 Мессенджер — точка входа** (перед любой правкой каналов) | [`.claude/rules/messenger-ledger.md`](../.claude/rules/messenger-ledger.md) |
| **Как устроены каналы** (TG/Wazzup/Email/MTProto) | [`.claude/rules/channels.md`](../.claude/rules/channels.md) |
| **Ловушки — читать перед правкой** | [`.claude/rules/gotchas.md`](../.claude/rules/gotchas.md) |
| **Что нельзя «чинить»** (by-design, ложные тревоги аудита) | [`.claude/rules/audit-false-positives.md`](../.claude/rules/audit-false-positives.md) |
| **Инцидент прямо сейчас** | [`docs/runbook.md`](runbook.md) |
| **Известные баги** | [`docs/bugs/`](bugs/) |

## 🚧 Карантин — трогать только со смоком

Самая хрупкая часть — **мессенджер** (неявные контракты между БД-триггерами,
edge-функциями и фронтом; исторически ломался при «оптимизациях»). Это
**карантинная зона**: при общем аудите/рефакторинге НЕ трогается, правки — только
точечно под задачу и **со смок-тестом** ([`runbook.md` §7](runbook.md)).

Что в карантине: `supabase/functions/telegram-*`, `wazzup-*`, `gmail-*`,
`email-internal-send`, `_shared/syncTelegram*`; `mtproto-service/`;
`src/components/messenger/`, `src/hooks/messenger/`; триггер
`dispatch_message_to_channels` и дедуп-индексы в БД. Полный список —
[`refactoring.md`](../.claude/rules/refactoring.md).

## Деплой (что чем катится) и откат

| Что | Команда | Авто? |
|-----|---------|-------|
| Фронт | `git push origin main` | ✅ CI (blue/green) |
| Edge Functions | `scripts/deploy-edge.sh <имя>` | ❌ вручную + смок |
| Миграции БД | `supabase db push` / MCP `apply_migration` | ❌ вручную |
| mtproto | rsync + docker на VPS | ❌ вручную |

Откат, деплой-детали, диагностика — [`docs/runbook.md`](runbook.md).
`git push` — **только с явного «да» владельца** (уезжает в прод через CI).

## Гарды, которые ловят регрессии автоматически (доверяй им)

- **CI quality-гейт** — `lint + npm test` блокируют деплой фронта.
- **`scripts/db-drift-check.mjs`** — ловит расхождение кода БД с боевой базой.
- **`scripts/check-db-invariants.mjs`** — валит CI, если сломано правило формулы
  непрочитанного, разошлись колонки досок, или появилась SECURITY DEFINER функция
  с `PUBLIC/anon` execute вне whitelist (частый источник IDOR).
- **`smoke-channels.yml`** (крон) — реальная отправка по всем каналам в тест-треды.
- Автотесты пути отправки: `messengerDraftService*.test.ts` (гейт утечки клиенту).

## Три правила, которые сэкономят часы

1. **Мессенджер — сначала читай [`messenger-ledger.md`](../.claude/rules/messenger-ledger.md), потом правь, потом обнови ledger.**
2. **Перед «починкой» странности — проверь [`audit-false-positives.md`](../.claude/rules/audit-false-positives.md) и [`docs/bugs/`](bugs/)** — возможно, это by-design или уже расследовано.
3. **Отлаживай измерением, а не гаданием** — логи/SQL/замер рантайма, потом один точечный фикс.
