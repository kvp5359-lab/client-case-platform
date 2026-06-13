# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Источники правды

Подробные правила и контракты — в `.claude/rules/`. Глобальный стиль общения и принципы отладки — в `~/.claude/CLAUDE.md` (подгружаются автоматически, тут не дублируем).

| Файл | Что внутри |
|------|-----------|
| [`.claude/rules/infrastructure.md`](.claude/rules/infrastructure.md) | Стек, архитектура, Supabase операции, миграции, Edge Functions деплой, mtproto-service, VPS/nginx/blue-green, env, локалка |
| [`.claude/rules/data-model.md`](.claude/rules/data-model.md) | `project_threads` (треды), корзина, права, статусы проектов, календарь, дневник, sidebar, TaskPanel-вкладки, импersonация, блокировка, фильтры, item_lists, глобальный поиск, маркетплейс, роуты |
| [`.claude/rules/messenger-ledger.md`](.claude/rules/messenger-ledger.md) | **🔴 ТОЧКА ВХОДА ПО МЕССЕНДЖЕРУ. Читать ПЕРВЫМ при любой правке/расследовании мессенджера и ОБНОВЛЯТЬ после.** Журнал расследований (гипотезы вкл. отвергнутые), текущее состояние, повторяющиеся грабли, индекс на остальное |
| [`.claude/rules/channels.md`](.claude/rules/channels.md) | **Карантин.** Мессенджер: матрица каналов, общий слой Edge, авторизация, send_status. TG group/Business/MTProto, Wazzup, Email, личные диалоги, аватары |
| [`.claude/rules/gotchas.md`](.claude/rules/gotchas.md) | **Читать перед правкой.** RLS short-circuit, multi-bot dedup, Webpack dev, --no-verify-jwt, INTERNAL_FUNCTION_SECRET, pg_cron service_role, nginx-буферы, partial-unique upsert, reorderWithinZones, маршрутизация триггера |
| [`.claude/rules/refactoring.md`](.claude/rules/refactoring.md) | 10 зон аудита + карантинные зоны (мессенджер/email/mtproto), формат отчёта |
| [`.claude/rules/audit-false-positives.md`](.claude/rules/audit-false-positives.md) | **Читать перед аудитом.** Места, которые выглядят как баги/дубли/legacy, но на самом деле by design — чтобы не тратить часы на их «починку» |

## Decision tree — какой файл когда читать

| Задача | Куда смотреть в первую очередь |
|--------|-------------------------------|
| **Любая правка/расследование мессенджера** (TG/Wazzup/Email/MTProto, send/webhook/реакции/реплаи) | **`messenger-ledger.md` ПЕРВЫМ** → потом `channels.md` + `gotchas.md`. После правки — обновить ledger |
| Жалоба «не работает X» | `docs/bugs/` → потом `gotchas.md` |
| Новая фича / миграция | `data-model.md` (есть ли похожее), `infrastructure.md` (Supabase ops) |
| Деплой / nginx / VPS / blue-green | `infrastructure.md` |
| Edge Function деплоится с ошибкой | `gotchas.md` (--no-verify-jwt, secrets, 401 шлюз vs наш код) |
| Бот / Wazzup / Email / MTProto | `channels.md` + `gotchas.md` |
| RLS / триггеры / RPC | `gotchas.md` (RLS short-circuit) + `data-model.md` |
| Аудит / рефакторинг | `refactoring.md` (зоны + карантин) |
| История «когда делали Y» | `docs/changelog/` |
| Что в работе | `docs/feature-backlog/` |

## Команды

```bash
npm install
npm run dev          # http://localhost:8080 — Next 16 на Webpack, НЕ Turbopack
npm run build
npm run lint         # eslint --max-warnings 0
npm test             # vitest run
npm run test:watch
npm test -- path/to/file.test.ts        # один файл
npm test -- -t "имя теста"              # один кейс
```

Supabase:
```bash
supabase db push --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy <name> [--no-verify-jwt] --project-ref zjatohckcpiqmxkmfxbs
supabase functions logs <name> --project-ref zjatohckcpiqmxkmfxbs
supabase secrets set KEY=value --project-ref zjatohckcpiqmxkmfxbs
supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts
```

VPS:
```bash
ssh vps                                    # 72.61.82.244
docker ps                                  # blue/green: clientcase-app-blue / -green
```

## Поведение при правках (техдолг-стратегия)

Цель — лечить техдолг **постепенно, на месте правки**, без бесконечного аудит-марафона. Два правила:

### 1. При правке файла — следи за размером

Если после твоей правки файл превысил **500 строк** И внутри смешана логика с UI (много `useEffect`/`useMemo` прямо в теле компонента до `return`) — **в конце правки коротко предложи распил**. Не сам, а спроси.

Что НЕ считать «требует распила»:
- Оркестратор (тонкое тело + 5+ под-компонентов или хуков)
- Чистая функция-движок (`filterEngine`, `applyFilters`) — пусть остаётся монолитом
- Сгенерированное (`database.ts`)
- См. [`audit-false-positives.md`](.claude/rules/audit-false-positives.md) → раздел про большие файлы

Pre-commit hook (см. ниже) дублирует это на уровне git — выдаёт warning, если файл перевалил порог.

### 2. После большой сессии — короткий отчёт «по пути»

Если в сессии тронуто **>5 файлов** — в конце дать короткий отчёт «что заметил мимоходом»: дубль, явный мёртвый импорт, забытый TODO. По 1-2 строки на пункт.

НЕ начинать чинить эти пункты в той же сессии — это не предмет текущей задачи. Только зафиксировать в ответе, пользователь решает.

### Pre-commit hook

В репо стоит `.githooks/pre-commit` — предупреждает (НЕ блокирует) о файлах >500 строк, которые перевалили порог или выросли. Активация после клона:

```bash
git config core.hooksPath .githooks
```

Отключить однократно: `git commit --no-verify`.

## Чеклист перед сдачей задачи

- [ ] `git status` перед массовыми правками (не перезатереть чужой незакоммиченный код).
- [ ] Если трогаешь мессенджер/email/mtproto — **прочитал [`messenger-ledger.md`](.claude/rules/messenger-ledger.md) первым** + соответствующий раздел `channels.md` + `gotchas.md`, и **обновил ledger** (расследование/состояние/грабли) после правки.
- [ ] Если менял RLS на `project_threads` — сохранил short-circuit `created_by = auth.uid()`.
- [ ] Если деплоил Edge Function на webhook или `*-send` — флаг `--no-verify-jwt`.
- [ ] Если изменил BD-схему — `supabase gen types typescript ... > src/types/database.ts`.
- [ ] Если добавил мутацию — инвалидировал релевантные query keys из `src/hooks/queryKeys/`.
- [ ] `npm run lint && npm test` зелёные.
- [ ] Не пушил без явного «да».
