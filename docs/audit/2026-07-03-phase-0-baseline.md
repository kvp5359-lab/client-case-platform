# Аудит, Фаза 0 — Baseline и инвентаризация (2026-07-03)

## Резюме

Проект в рабочем состоянии: lint 0 ошибок, 753/753 теста зелёные, production build собирается за 6.4 с без ошибок. Все 7 cron-джобов живы (0 фейлов за 7 дней). Масштаб: ~195k строк кода (без тестов и database.ts), 72 роута, 93 Edge Functions, 308 миграций, 166 таблиц, 477 RLS-политик, 297 функций в public. Главные наблюдения для следующих фаз: подтверждён дрейф repo↔prod ключевых RPC, на VPS копятся зомби-контейнеры certbot (~70 шт.), тестами покрыты только hooks/utils/store — весь слой components/page-components без тестов.

## 1. Git

- Ветка: `main`. Незакоммиченное на момент аудита: 5 изменённых файлов (`InboxChatItem.tsx`, `MessageBubble.tsx`, `ReactionBadges.tsx`, `ThreadRow.tsx`, `ThreadTableView.tsx`) + новый `docs/audit/2026-07-03-full-audit-prompts.md`. Аудит их не трогает.
- Последние коммиты — активная разработка мессенджера/панели/шаблонов (по несколько коммитов в день).

## 2. Сборка и качество

| Проверка | Результат |
|---|---|
| `npm run lint` (`--max-warnings 0`) | ✅ 0 ошибок |
| `npm test` | ✅ 56 файлов, **753/753**, 4.9 с |
| `npm run build` | ✅ Compiled successfully in **6.4 s** |
| Dev-сервер во время build | Не был запущен (конфликта .next нет) |

## 3. Размеры

- **~195 286 строк** TS/TSX в `src/` (без `*.test.*` и `database.ts`); всего с тестами ~218k.
- **72 роута** (`page.tsx`), из них статических — только публичные (about/blog/lawyers/privacy/terms/_not-found), всё остальное — dynamic (ƒ).
- **93 Edge Functions**, **308 миграций**, **61 prod-зависимость** + 17 dev.
- Топ файлов по строкам (см. п.8 — большинство оркестраторы): `SidebarEditorCanvas.tsx` **1092**, `MessengerTabContent.tsx` 787, `TaskPanelTabbedShell.tsx` 761, `MessageInput.tsx` 713, `ThreadTemplateFields.tsx` 682, `ChatSettingsDialog.tsx` 680, `MessageBubble.tsx` 644, `MessageList.tsx` 639.

## 4. Бандл

Next 16 в этой конфигурации не печатает таблицу First Load JS per-route. По чанкам `.next/static/chunks`: топ — 388K, 384K, 236K, 236K, 212K, 200K×2, 180K (до gzip). Детальный разбор «что тянет вес» — Фаза 3 (нужен bundle analyzer или сопоставление чанков с модулями).

## 5. БД (прод, read-only)

- **166 таблиц** public, **477 RLS-политик**, **297 функций**, **7 cron-джобов**.
- Топ таблиц по размеру: `project_messages` **45 MB / 15 014 строк**, `thread_inbox_meta` 7 MB / 1503, `documents` 5.9 MB / 1463, `audit_logs` 5 MB / 9876, `project_threads` 3.8 MB / 1913, `docbuilder_project_blocks` 3.1 MB, `files` 2.5 MB / 4213, `message_attachments` 1.7 MB / 3169, `thread_unread_state` 1.2 MB / 2921.
- Объёмы пока маленькие (мегабайты) — запас по «сырой» ёмкости огромный; узкие места не в размере данных, а в форме запросов (Фаза 2).
- Расширения (установлены): pg_trgm, unaccent, vector 0.8, pg_net, pg_cron, pgcrypto, pg_stat_statements ✅ (пригодится в Фазе 2), uuid-ossp, supabase_vault.

### Cron-джобы — все живы, 0 фейлов за 7 дней

| Job | Расписание | Последний статус |
|---|---|---|
| gmail-watch-refresh | 0 3 * * * | succeeded |
| scan-dispatch-failures | * * * * * | succeeded |
| google-calendar-sync | */10 | succeeded |
| dispatch-scheduled-messages | * * * * * | succeeded |
| cleanup-cron-job-run-details | 17 4 * * * | succeeded |
| inbox-reconcile | 0 4 * * * | succeeded |
| generate-recurring-tasks | */10 | succeeded |

## 6. Advisors

Сырой вывод security-advisors — 293 KB (разбор в Фазе 1, отчёт phase-1). Performance-advisors — разбор в Фазе 2.

## 7. Дрейф repo↔prod (ключевые RPC)

Снял md5 живых тел из прода (эталон для будущих сверок):

| Функция | md5 (прод, 2026-07-03) | Последняя миграция в репо | Дрейф |
|---|---|---|---|
| get_inbox_threads_v2 | 6fdc3c7c… | 20260617_inbox_v2_email_counterpart_lateral | вероятен (ledger: правки через MCP) |
| get_inbox_threads_v3_for | cb5adef6… | 20260701_inbox_preview_skip_deadline_silent | **подтверждён ledger'ом** (полное тело только в проде) |
| get_workspace_threads | 254a6d93… | 20260623_…email_unsent | вероятен |
| get_board_filtered_threads | a8782fd8… | 20260624_…email_unsent | — |
| dispatch_message_to_channels | 3e7db0cc… | 20260618_routing_skip_internal_visibility | **подтверждён** (правки 06-26 channel_defaults шли поверх) |
| recompute_thread_unread_for | 5714e711… | 20260701210436_deadline_events_not_unread | **подтверждён** (emoji-захват только в проде) |
| can_user_access_thread | f6ef1377… (2 overload) | row-overload 20260524 | — |
| route_incoming_to_project | 978b062e… | 20260626_route_incoming_use_channel_defaults | — |
| compute_thread_inbox_meta | f93a5c10… | 20260617 | вероятен (тай-брейки id DESC добавлялись 06-18 через MCP) |

Вывод: **репо не воспроизводит прод** для минимум 3-4 критичных функций. Это блокер для «поднять второй инстанс с нуля» (детали — Фазы 2 и 8).

## 8. Тестовое покрытие — карта дыр

Тесты сосредоточены в `src/hooks/`, `src/utils/`, `src/store/`, `src/lib/`. **Ноль тестов** во всём UI-слое:

- `src/components/messenger` (73 файла), `tasks` (40), `templates` (34), `boards` (28), `ui` (44), `WorkspaceSidebar` (22) — и остальные components/*
- `src/page-components/*` целиком (ItemListsPage 18, KnowledgeBasePage 17, workspace-settings 15…)
- `src/hooks/queryKeys` (16 файлов) — фабрики ключей без тестов

Оценка критичности дыр — Фаза 5.

## 9. Инфраструктура (VPS, факт vs документация)

- Активный цвет: **green** (`clientcase-app-green` Up 8 hours), blue погашен — соответствует blue/green схеме. `clientcase-mtproto` Up 7 days. Диск: 35G/96G (37%) — ок.
- 🟠 **~70 зомби-контейнеров `relostart-certbot-run-*`** (копятся с мая, по одному каждые 1-2 дня) — не наш сервис, но общий VPS: мусор в docker ps, утечка ресурсов при росте.
- 🟡 `relostart-app` и `relostart-app-dev` в статусе **unhealthy** 8 дней (чужие сервисы, но сигнал, что за VPS никто не следит автоматически — тема Фазы 4).
- 🟡 Недокументированные контейнеры против infrastructure.md: `clientcase-app-test` (Up 8 weeks — зачем?), `clientcase-provision`, `gotenberg`, `tg-kb-mcp`. infrastructure.md перечисляет не всё.

## Проверено — проблем нет

- lint/test/build зелёные; cron-джобы все успешны 7 дней; диск VPS свободен; blue/green работает как описано; активный воркспейс данных мал (мегабайты).

## Не проверено (переносится в профильные фазы)

- Разбор advisors (Фазы 1-2), точный дифф drift-функций (частично Фаза 2), First Load JS по роутам (Фаза 3), содержимое `clientcase-app-test`/`clientcase-provision` (Фаза 4/8).
