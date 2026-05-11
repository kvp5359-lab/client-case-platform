# Ночной аудит проекта + унификация CORS + распил telegram-webhook-v2

**Дата:** 2026-05-11
**Тип:** refactor + perf + sec + docs
**Статус:** completed

---

## Контекст

После долгой серии feature-волн (Personal Dialogs, Item Lists, Finance,
Wazzup, Email-Resend, Impersonation) накопилась техническая задолженность:
несколько мёртвых компонентов после миграций, мегамонолитные edge
functions, инлайновые query-keys мимо реестра, разрозненные CORS-стратегии
в edge functions, рассогласованная `infrastructure.md` (раздел про
Telegram Business / Wazzup всё ещё описывал старую модель с системными
проектами-инбоксами).

Поэтому за ночь — три волны аудита по 10–11 зонам и финальная зачистка
оставшегося. Делалось без пользовательских подтверждений в режиме
«сломал — починим утром», поэтому акцент на **обратимых** изменениях:
переносы кода без смены поведения, индексы с `IF NOT EXISTS`, удаление
файлов, которые сначала проверялись на 0 использований.

## Решение

### 1. Аудит-волна 1 — точечные правки

Десять зон по `~/.claude/CLAUDE.md` → «Рефакторинг по зонам».
Найдено и починено:

- **A1** инлайновые query keys — 23 места переведены в реестр
  `src/hooks/queryKeys.ts`. Новые группы: `threadEmailSettingsKeys`,
  `threadScopeKeys`, `projectClientThreadKeys`, `templatesForRoutingKeys`,
  `slotTemplatesKeys`, `integrationsKeys`, `workspaceDomainKeys`,
  `clientWorkspaceProjectsKeys`, `projectFieldsKeys`.
- **A2** broad-invalidate с неверными префиксами — после анализа
  оказалось не баг (prefix-match React Query уже работал), но
  перевели на типизированные ключи из реестра.
- **A3** миграция `20260510_thread_owner_user_id.sql` ссылалась на
  колонки, которые удаляет соседняя миграция → оба UPDATE обёрнуты
  в DO-блок с проверкой `information_schema.columns`. Теперь
  работает в любом порядке.
- **A4** добавлены составные индексы на `project_threads`:
  `(workspace_id, is_deleted)`, `(workspace_id, type, is_deleted)`,
  `(project_id, is_deleted)`.
- **A5** убран `as unknown as ProjectWithTemplate` в `ProjectContext.tsx` —
  заменён на `.maybeSingle<ProjectWithTemplate>()`.
- **A6** `documentKitUI.resetState()` теперь вызывается при смене
  `projectId` в `ProjectProvider` — иначе пользователь видел открытые
  диалоги от прошлого визита.
- **A13** `DROP TABLE IF EXISTS` для `wazzup_outgoing_dedup`.
- **A16** добавлен раздел «Права доступа к модулям проекта» в
  `infrastructure.md` (как взаимодействуют `enabled_modules` и
  `module_access`).

### 2. Аудит-волна 2 — полный последовательный обход

11 зон последовательно, без параллельных агентов, чтобы не потерять
тщательность. Найдено:

**Документация рассогласована:**

- В `infrastructure.md` раздел про Telegram Business и Wazzup описывал
  старую модель с системными проектами-инбоксами
  (`is_system_business_inbox=true`), хотя миграция
  `20260510_drop_system_inbox_projects.sql` дропнула все эти колонки.
  Раздел переписан под новую модель «личные диалоги без проекта»
  (тред с `project_id=NULL` + `owner_user_id`).
- Роуты в инфре указывали 61 страницу, реально стало 62 (добавлен
  `/workspaces/[id]/personal-dialogs` + сетка `finance-*-categories`
  и `/slot-templates` + `/digests` и `/integrations` и `/domain`).
- Категоризация Edge Functions была устаревшей — переписал под
  актуальные ~75 функций.
- В `refactoring.md`: `middleware.ts` → `proxy.ts` (Next 16
  переименовал по умолчанию).

**Мёртвый код (−1576 строк):**

- `KnowledgeChat.tsx` + 5 саттелитов (`KnowledgeChatInput`,
  `KnowledgeChatMessage`, `KnowledgeConversationList`,
  `SourceSelectionList`, `StreamingKnowledgeMessage`) +
  3 хука (`useKnowledgeSearch`, `useKnowledgeConversations`,
  `useKnowledgeMessages`) — компонент нигде не монтировался.
- `documents/dialogs/MergeDocumentsDialog.tsx` (190 строк) — дубль
  никем не используемый, реальный в `DocumentKitsTab/dialogs`.
- 3 мёртвых barrel-файла: `src/hooks/index.ts`,
  `src/page-components/ProjectPage/components/index.ts`,
  `src/components/projects/DocumentKitsTab/hooks/index.ts` (после
  деплоя выяснил, что последние два используются через
  относительные импорты `./...`/`./...` — восстановил).
- `KnowledgeSourceInResponse` type-alias.
- `inboxKeys.threadsV2` deprecated алиас + 11 callers переведены на
  `.threads`.

**БД-перфоманс:**

- 70 индексов на `unindexed_foreign_keys` (миграция
  `20260511_unindexed_fk_indexes.sql`).
- `auth_rls_initplan` фикс — 3 политики `project_participants_*`
  переписаны на `(SELECT auth.role())` вместо `auth.role()`
  (миграция `20260511_project_participants_rls_initplan.sql`).

**Безопасность Edge Functions (CORS):**

В `_shared/edge.ts` был хардкоженный wildcard
`Access-Control-Allow-Origin: *` — небезопасно при использовании
credentials. Добавил `corsHeadersFor(req)` — обёртка над
`getCorsHeaders` из `_shared/cors.ts` (whitelist по доменам).
`preflight(req?)` и `jsonRes(payload, status, req?)` принимают
опциональный `req` для динамического CORS. Старые
сигнатуры без `req` оставлены back-compat для деплоя.

Мигрированы на dynamic CORS:

- Первая партия (8 функций через `_shared/edge.ts`):
  `wazzup-mark-read`, `wazzup-fetch-channels`, `wazzup-send`,
  `wazzup-webhook`, `wazzup-send-reaction`, `wazzup-set-webhook`,
  `email-internal-send`, `fetch-telegram-avatar`,
  `provision-email-domain`.
- Вторая партия (10 функций с inline `corsHeaders`):
  `fetch-sheets`, `google-oauth-start/exchange/refresh`,
  `google-docs-export`, `translate-block`, `analyze-documents`,
  `generate-block`, `provision-domain`, `fetch-image`. `sandbox-test`
  оставлен — dev playground.

**Унификация:**

- `ChatEmptyState` — было 2 разных компонента с одним именем (в
  `messenger/` и в `shared/`). Разведены: `MessengerEmptyState`
  (пустой чат с MessageSquare) и `AiChatEmptyState` (пустой
  AI-чат с Sparkles, props-driven).

### 3. Аудит-волна 3 — закрытие отложенных пунктов

Семь пунктов из backlog, которые в первых двух волнах были
помечены «осознанно отложено». Пользователь явно сказал «делай
без подтверждений»:

- **A10** `queryKeys.ts` (913 строк, 82 экспорта) разбит на 13
  тематических модулей: `constants/projects/workspace/messenger/
  documents/forms/knowledge/participants/templates/directories/
  finance/integrations/misc`. Старый монолит удалён, импорты
  `from '@/hooks/queryKeys'` резолвятся на новый barrel
  автоматически.
- **A14** типизированный supabaseMock helper —
  `src/test/supabaseMocks.ts` с `mockSupabaseRpc`,
  `setSupabaseRpcMock`, `setSupabaseAuth`. 19 `(supabase.rpc as any)`
  + 5 `(supabase as any).auth` → 0 кастов в тестах.
- **A15** `aiSessions` cleanup при смене workspaceId в `sidePanelStore`.
  localStorage с persistedConversations остаётся, при возврате на
  проект `getAiSession()` отбилдит сессию из persist'а. +2 теста.
- **A11/A12** `<button>` vs shadcn `Button` — после анализа всех 8
  кейсов в `src/components/ui/` оказались легитимными (намеренная
  кастомизация без `Button`-дефолтов). Закрыто как false positive.
- **A8** `telegram-send-message/index.ts` (1089 строк) распилен на:
  `index.ts` (~560: главный handler), `helpers.ts` (~70:
  `loadReplyQuoteHtml`, `isReplyNotFoundError`, `isTelegramPhotoMime`),
  `attachments.ts` (~420: `resolveAttachment`,
  `sendAttachmentsWithFallback`, `sendAttachments`).
- **A7** (частично, продолжение в волне 4) — типы и pure-helpers
  вынесены в `types.ts` и `pure.ts`. Главный handler остался.
- **A17** интеграционные тесты мутаций —
  `useProjectServices.test.ts` с 5 кейсами на связку
  `create/update/patch/delete → invalidateQueries →
  projectServiceKeys.list(projectId)`. Эталон для тиражирования.

### 4. Волна 4 — добил A7

Распилил `telegram-webhook-v2/index.ts` с 2227 строк до 96. Главная
проблема — глобальные `service` / `BOT_TOKEN`, которые использовали
все handler'ы. Решение: вынес в `shared.ts`, токен теперь
getter/setter (`getBotToken()` / `setBotToken(t)`), index.ts вызывает
`setBotToken` после auth, все handler'ы читают через геттер.

Получилось 14 модулей по доменам — см. таблицу в
`infrastructure.md` (раздел «Распил telegram-webhook-v2»).

### 5. Применение к проду

Через MCP Supabase применены 3 миграции:

- `20260511_project_threads_perf_indexes` (3 составных индекса).
- `20260511_unindexed_fk_indexes` (70 индексов на FK).
- `20260511_project_participants_rls_initplan` (3 RLS-политики).

Проверка `get_advisors('performance')` после миграций:

- `unindexed_foreign_keys`: **71 → 0** ✓
- `auth_rls_initplan`: **3 → 0** ✓
- `unused_index`: 107 → 181 (ожидаемо: новые индексы пока не задеты
  запросами, станут «used» когда полетят настоящие SELECT/JOIN).

## Файлы

**Новые миграции:**

- `supabase/migrations/20260511_project_threads_perf_indexes.sql`
- `supabase/migrations/20260511_unindexed_fk_indexes.sql`
- `supabase/migrations/20260511_project_participants_rls_initplan.sql`

**Новые модули (telegram-webhook-v2/):**

- `shared.ts`, `types.ts`, `pure.ts`, `tg-api.ts`, `bindings.ts`,
  `participants.ts`, `media.ts`, `session.ts`, `knowledge.ts`,
  `commands.ts`, `upload-slot.ts`, `callbacks.ts`, `sync.ts`

**Новые модули (telegram-send-message/):**

- `helpers.ts`, `attachments.ts`

**Новые модули (queryKeys/):**

- `constants.ts`, `projects.ts`, `workspace.ts`, `messenger.ts`,
  `documents.ts`, `forms.ts`, `knowledge.ts`, `participants.ts`,
  `templates.ts`, `directories.ts`, `finance.ts`, `integrations.ts`,
  `misc.ts`, `index.ts` (barrel)

**Новые helpers:**

- `src/test/supabaseMocks.ts`

**Новые тесты:**

- `src/hooks/useProjectServices.test.ts` (5 тестов)

**Изменённые edge functions (CORS):**

- `_shared/edge.ts`, `wazzup-*` ×6, `email-internal-send`,
  `fetch-telegram-avatar`, `provision-email-domain`, `fetch-sheets`,
  `google-oauth-*` ×3, `google-docs-export`, `translate-block`,
  `analyze-documents`, `generate-block`, `provision-domain`,
  `fetch-image`

**Удалённые файлы:**

- `src/components/knowledge/KnowledgeChat.tsx` и 5 саттелитов
- `src/hooks/knowledge/useKnowledgeSearch.ts` + 2 хука
- `src/components/documents/dialogs/MergeDocumentsDialog.tsx`
- `src/hooks/index.ts` (мёртвый barrel)
- `src/hooks/queryKeys.ts` (заменён на папку)

**Доки:**

- `.claude/rules/infrastructure.md` — три ключевых правки:
  раздел про модули мессенджера переписан под новую модель
  (Personal Dialogs без системных проектов), добавлен раздел
  «Распил telegram-webhook-v2» с таблицей 16 модулей, расширен
  блок про `_shared/edge.ts` (dynamic CORS).
- `.claude/rules/refactoring.md` — `middleware.ts` → `proxy.ts`,
  отметка про дропнутую `project_template_tasks`.
- `docs/audit-backlog.md` — три волны сводок и обоснований
  отложенного.

## Тестирование

- `npm test` — **637/637 passed** ✓ (+7 новых: 2 на aiSessions,
  5 на useProjectServices мутации).
- `npm run lint` — **0 ошибок**.
- `npm run build` — production build проходит, все 62 роута
  скомпилировались.
- `mcp__supabase__get_advisors('performance')` после миграций —
  ожидаемые результаты (см. выше).
- Preview-сервер (Next.js dev на :8080) — компилит чисто, страницы
  отдаются 200.

## Деплой

- Все 3 миграции применены через MCP Supabase по ходу сессии.
- Edge Functions переписаны, но **не задеплоены** через
  `supabase functions deploy` — нужно сделать вручную утром:

```bash
# Главные распилы и CORS:
supabase functions deploy telegram-webhook-v2 --no-verify-jwt --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy telegram-send-message --no-verify-jwt --project-ref zjatohckcpiqmxkmfxbs

# Остальные мигрированные на dynamic CORS (10 функций):
supabase functions deploy fetch-sheets --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy google-oauth-start --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy google-oauth-exchange --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy google-oauth-refresh --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy google-docs-export --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy translate-block --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy analyze-documents --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy generate-block --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy provision-domain --project-ref zjatohckcpiqmxkmfxbs
supabase functions deploy fetch-image --project-ref zjatohckcpiqmxkmfxbs
```

- Фронт уйдёт стандартным blue/green pipeline'ом из
  `.github/workflows/deploy.yml` после push в main.

## Что осталось на потом

- **84 multiple_permissive_policies** — пары перекрывающихся RLS.
  Требует ручного разбора каждой пары — большой scope, риск убрать
  важное разрешение.
- **107 unused indexes** — наблюдать 1–2 месяца, потом провести
  волну удалений (после моих 70 новых индексов их фактически 181,
  но это нормально — они станут «used» под нагрузкой).
- **`docbuilder` / `docbuilder-covers` public buckets** — отметил
  как «by design», но реальные файлы не аудировал. Возможно нужен
  ручной просмотр на предмет файлов, которые не должны быть
  публичны.
- **Тесты на остальные хуки мутаций** — `useProjectServices.test.ts`
  это эталон. По аналогии можно покрыть `useProjectTransactions`,
  `useFormKitMutations`, etc. (~20–30 файлов).
- **Распил остальных крупных edge functions** — `generate-block`
  (662), `_shared/knowledgeRag.ts` (607), `telegram-business-webhook`
  (590), `email-internal-send` (573), `google-docs-export` (552),
  `generate-project-digest` (549), `wazzup-webhook` (517). Каждая
  логически разделима, но требует браузерной/функциональной
  верификации.

## Решения и компромиссы

**Удалять barrel без 100% уверенности — плохая идея.** Я в первой
волне удалил `src/page-components/ProjectPage/components/index.ts`
и `src/components/projects/DocumentKitsTab/hooks/index.ts` по
результатам `grep` на `from '@/...'`-импорты. Оказалось — оба
импортируются через **относительные** пути (`./...`), которые
мой grep не покрыл. Dev-сервер сломался Build Error'ом. Восстановил
файлы из git history (`git show <prev-commit>:<path>`).
Урок: проверять все формы импортов, не только absolute alias.

**Глобали в edge functions — getter/setter, а не параметры.**
Альтернатива была — передавать `service` / `BOT_TOKEN` параметрами
в каждый handler. Это ломает все 80+ сигнатур функций и делает код
многословным. Getter/setter в `shared.ts` — компромисс: handler'ы
читают через `getBotToken()` без знания, кто его выставил;
index.ts на каждом запросе вызывает `setBotToken(t)`. Минус:
теоретически параллельные запросы могут перезаписать токен друг
другу, но v2 webhook обслуживает одного бота, токен одинаковый
для всех request'ов.

**Динамический CORS только когда передан `req`.** В
`_shared/edge.ts` старые сигнатуры (`preflight()`, `jsonRes(p, s)`)
сохранены, добавлены варианты с `req?`. Это даёт обратную
совместимость — те функции, которые ещё не мигрировали, продолжают
получать wildcard `*`. Постепенная миграция вместо
big-bang-coordinated-deploy.

**Распил без переноса поведения.** На всех трёх волнах рефакторинга
правило было одно: **функция переезжает, сигнатура и логика
сохраняются**. Никаких «улучшений по дороге» — переименований,
переписывания control flow, замены условий на early-return. Это
делает регрессии маловероятными при отсутствии edge-тестов: если
функция работала до переноса, она работает и после.

**`docs/audit-backlog.md` хранит не только TODO, но и обоснования
отказов.** Когда какой-то пункт решено НЕ делать (false positive
после анализа, риск UX-регрессии, требует контекста которого нет) —
это пишется в файл с пометкой ⚪ by design / 🟡 отложено. Так
следующий раз, когда я (или другой агент) увижу тот же advisor,
не буду заново тратить время на исследование — посмотрю что уже
думали и почему оставили.
