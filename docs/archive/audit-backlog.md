# Audit backlog (что осталось после прохождения 10 зон)

Полный аудит по 10 зонам отрефакторил `infrastructure.md` принципам.
Большинство 🔴 и 🟠 пунктов закрыто в коммитах в `main`. Здесь — то,
что осознанно отложено: **высокий риск** регрессий, **большой scope**
с низким отношением выгоды к усилиям, или **требует контекста**, которого
у меня нет.

При следующем подходе берёшь оттуда самый ценный пункт, открываешь
ветку с тестами в браузере, делаешь.

---

## 🟠 Среднее, осознанно отложено

### 6.6 `messengerService.ts` (580 строк) — НЕ распиливать

**Почему не сделано:** файл уже плоский набор `export async function` —
не god-компонент, а просто длинный сервис. Каждая функция изолирована,
имеет свой docstring. Сплит даст +3 файла и -3 каждый, но не уменьшит
когнитивную сложность. Если делить — то по доменам (read/send/edit),
но это меняет 30+ import-сайтов ради 60-строчных файлов.

**Когда нужно делать:** только если в файле появится 800+ строк или
несколько новых функций требуют общего state/refs.

---

### 6.7 `BoardView.tsx` (564 строки) — НЕ распиливать сейчас

**Почему не сделано:** DnD-heavy компонент (`@dnd-kit` контекст + 4
sensor'a + кастомный drag overlay). Любое разделение state между
host'ом и под-компонентами ломает DnD-payload. Сплит **требует** ручного
прогона:
- drag доски → колонки → между колонками
- drag карточек проекта между колонками с автообновлением статуса
- drag вкладок в TabBar

**Когда нужно делать:** в отдельной сессии с открытым браузером.
План разбиения:
- `BoardDndContext.tsx` — `<DndContext sensors=... collisionDetection=...>`
  + `<DragOverlay>` + onDragStart/onDragOver/onDragEnd
- `BoardColumns.tsx` — рендер колонок без DnD-логики
- `BoardCard.tsx` — отдельная карточка (уже отделён, проверить
  переиспользование)

---

### 6.9 `useDocumentKitSetup.ts` (489 строк) — НЕ распиливать

**Почему не сделано:** хук — это композиция 8 операций
(`useDocumentEdit`, `useFolderOperations`, `useDocumentMerge`,
`useDocumentCompress`, `useDocumentVerify` etc.) с общим shared state
через `latestRef`. Разделение меняет публичный API хука и каскадно ломает
~10 import-сайтов в DocumentKitsTab.

**Когда нужно делать:** в рамках более крупного рефакторинга
DocumentKitsTab — там есть собственный модуль (`/hooks` папка),
который заслуживает архитектурного пересмотра. Бэклог-файл:
[`docs/feature-backlog/document-kits-refactor.md`](feature-backlog/document-kits-refactor.md)
(если решишь делать — создай).

---

### 6.12 Унификация `*-webhook` Edge Functions

**Что:** telegram-webhook, telegram-business-webhook, wazzup-webhook,
resend-webhook — все четыре дублируют дедуп сообщений + создание тредов
+ поиск/создание контактов + insert в `project_messages`. Уже частично
выделено в `_shared/syncTelegramIncomingMessage.ts`, но Wazzup и Resend
используют свои реализации.

**Почему не сделано:** касается **продакшен-вебхуков**, через которые
идёт реальный трафик клиентов. Регрессия = пропавшие сообщения. Нужен
аккуратный план:
1. Запустить параллельно generic+legacy на одном канале (feature-flag)
2. Сравнить логи 24 часа
3. Переключить
4. Удалить legacy

**Когда нужно делать:** при следующем добавлении нового мессенджера
(будет 5-й канал — копипастить станет совсем больно).

---

### 8.1 Покрытие тестами хуков (16 / 137)

**Что не покрыто из критичного:**
- `useProjectThreads.mutations` — все 5 мутаций (Create/Delete/Rename/
  Pin/Update), особенно их инвалидации после моих правок в Phase 7
- `useSendMessage` / `useDeleteMessage` / `useEditMessage` — критический
  путь мессенджера
- `useTaskMutations` — статус/дедлайн/назначенцы
- `useTrash` (восстановление / hard delete)
- `useContactCard` + `useMoveThreadToProject` — после исправления
  broken invalidations нужен явный регресс-тест на правильные ключи

**Подход:** мокать `supabase.rpc` и `supabase.from(...)`, проверять
правильные `invalidateQueries`-вызовы.

**Бэклог:** [`docs/testing-backlog.md`](testing-backlog.md) уже есть —
вести по нему.

---

## 🟠 Среднее, частично сделано

### 1.6 Storage policies для `docbuilder-covers`

**Что сделано:** убран анонимный API-доступ к `docbuilder` bucket.

**Что осталось:** `docbuilder-covers` имеет политику FOR ALL для
`authenticated` — любой залогиненный может перезаписать/удалить чужую
обложку. Логически должно быть ограничено владельцем (`docbuilder_projects.user_id`),
но без контекста docbuilder-приложения я не знаю как именно
авторизация маппится на пути в bucket'е.

**Когда нужно делать:** при синхронизации с автором docbuilder-приложения.

---

### 2.2 multiple_permissive_policies — оставшиеся таблицы

**Что сделано:** консолидированы политики на 8 таблицах (3 в Phase 8
+ 5 в финальной чистке) — самые горячие. Дропнута редундантная политика
на `docbuilder_allowed_users`.

**Что осталось:** advisor всё ещё показывает ~150 случаев на 16 таблицах
из домена docbuilder_* (`docbuilder_blocks`, `docbuilder_sections`,
`docbuilder_templates`, etc.). Каждая имеет по 2 политики на CRUD-
действие, но обе нужны для разделения admin/user доступа.

**Почему не сделано:** docbuilder — отдельное приложение, у меня нет
домена. Сплит политик может всё сломать.

**Когда нужно делать:** при работе с docbuilder-кодом, когда понимаешь
структуру прав.

---

## 🟡 Низкие, не делал намеренно

- `unused_index` (91 шт) — преждевременно. Через 1–2 месяца
  смотреть pg_stat_user_indexes по реальной нагрузке.
- `auth_db_connections_absolute` — клик в Dashboard.
- Миграции с дублирующими именами (`enable_rls_boards` × 2 и т.п.) —
  косметика, разные timestamp = разные миграции.
- Стилистика `qc` vs `queryClient` — низкое значение.
- Vitest warning `--localstorage-file` — баг vitest 4, не наш.

---

## Что точно НЕ нужно делать

- Делить `messengerService.ts` (см. 6.6).
- Менять `roleConfig.ts` чтобы роли были data-driven — сейчас они
  системные, завязаны на permissions/onboarding.
- Унифицировать `useProjectThreads.queries` / `useTaskQueries` —
  у задач уже свой хук, и слияние ломает разделение ответственности.

---

# Аудит 2026-05-10 — новая порция

## Сводка по статусам (после ночного прогона)

| Пункт | Статус | Где смотреть |
|-------|--------|--------------|
| A1 | ✅ closed (основные) | коммиты a87e14d, f7f1927 |
| A2 | ✅ closed (стилистика) | коммит a87e14d — реальной баги не было, prefix-инвалидация уже работала |
| A3 | ✅ closed | коммит 8324a18 — DO-блок с защитой от порядка |
| A4 | ✅ closed | коммит 8324a18 — новая миграция 20260511_project_threads_perf_indexes |
| A5 | ✅ closed | коммит 861d1b2 |
| A6 | ✅ closed | коммит 861d1b2 |
| A9 | ✅ closed (false positive) | telegram-webhook v1 жив, используется через telegram-setup-webhook/register-webhook |
| A10 | 🟡 отложено | см. ниже — большой механический рефакторинг ~50 групп, без надзора рисково |
| A12 | 🟡 отложено | shadcn-trigger pattern (`<button>` внутри `DropdownMenuTrigger asChild`), замена на `Button` риск визуальных регрессий |
| A13 | ✅ closed | коммит 8324a18 |
| A14 | 🟡 отложено | `as any` в тестах — приемлемый компромисс, не плодим новый helper |
| A15 | 🟡 отложено | aiSessions cleanup при смене WS = UX-регрессия (юзер теряет открытые AI-чаты), leak только в памяти |
| A16 | ✅ closed | коммит 861d1b2 — добавлен раздел в infrastructure.md |
| A18 | ✅ closed (false positive) | `DialogBaseProps` используется в `FolderDialog.tsx` |

**Осталось открытым: A7, A8, A10, A11, A12, A14, A15, A17** — все 🟠/🟡, требуют либо подтверждения от пользователя, либо большой работы с визуальной верификацией.

## 🔴 Высокий приоритет

### A1. Инлайновые query keys мимо реестра (Зона 4)

48 мест с `queryKey: [...]` напрямую в компонентах/хуках, минуя
`src/hooks/queryKeys.ts`. Примеры:
- `['thread-scope']`, `['thread-email-settings']`
- `['project-clients']`, `['project-telegram-threads']`, `['project-email-threads']`
- `['workspace-domain']`, `['integrations', ...]`
- `['custom-directory-entries-batch']`, `['project-contact-candidates']`

**Риск:** при переименовании ключа в реестре эти места не отвалятся
компилятором — баг с инвалидацией обнаружится только в проде по жалобе.

**Что делать:** перенести все 48 в реестр, ESLint-правило (запрет
строкового `queryKey` массива в коде) — отдельной волной.

### A2. Broad-invalidate с неверными префиксами (Зона 4)

Несколько мест инвалидируют по префиксам, которые не совпадают со
структурой ключей в реестре. Например `['sidebar', 'projects']` —
а реальный ключ из `sidebarKeys` имеет больше компонентов и под этот
префикс не попадает. Симптом: после мутации UI не освежается, помогает
F5.

**Что делать:** пройти места с `invalidateQueries` без типизированного
ключа из реестра, заменить на `queryKey: keys.xxx.all`.

---

## 🟠 Средний приоритет

### A3. Миграция thread_owner_user_id ↔ drop_system_inbox (Зона 2)

`20260510_thread_owner_user_id.sql` в UPDATE ссылается на колонки
`projects.is_system_business_inbox/wazzup/email_inbox` и
`system_inbox_user_id`, которые удаляет соседняя миграция
`20260510_drop_system_inbox_projects.sql`. Сейчас работает только
потому, что timestamp файлов даёт правильный порядок. Если кто-то
прогонит миграции «с нуля» в другом окружении — может упасть.

**Что делать:** перенести логику UPDATE в финальную миграцию до DROP,
либо добавить явный `-- DEPENDS ON: ...` комментарий.

### A4. Индексы на project_threads (Зона 2)

RPC `get_workspace_threads`, `get_inbox_threads_v2`, `get_sidebar_data`
постоянно фильтруют `pt.workspace_id` + `pt.is_deleted` (часто +
`pt.type`). Составных индексов нет. На больших воркспейсах — будет
тормозить.

```sql
CREATE INDEX IF NOT EXISTS idx_project_threads_workspace_is_deleted
  ON project_threads(workspace_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_project_threads_workspace_type_is_deleted
  ON project_threads(workspace_id, type, is_deleted);
```

### A5. Опасный каст в ProjectContext.tsx:76 (Зона 3)

`return data as unknown as ProjectWithTemplate` — двойной каст без
runtime-валидации. Supabase не гарантирует, что JOIN дал ожидаемую
форму. Рискованно при изменении схемы.

**Что делать:** либо явно типизировать запрос через generic,
либо добавить минимальный runtime-чек на ключевые поля.

### A6. UI-стор не сбрасывается при смене проекта (Зона 5)

`documentKitUI` (раскрытые папки, открытые диалоги, editForm) держит
состояние per-project, но не сбрасывается при смене `pageContext.projectId`.
Симптом: возвращаешься на проект → видишь чужие открытые диалоги.

**Что делать:** в месте, где меняется `pageContext.projectId`, дёрнуть
`documentKitUI.resetState()`. Заодно `aiSessions` чистить при смене
воркспейса.

### A7. Edge Function telegram-webhook-v2 — 2227 строк (новое из размеров)

Монолит: приём сообщений, реакции, медиа-группы, дедуп, обогащение
participants, аватарки. Каждая ветка handler уже использует helpers из
`_shared/`, но сам index.ts — гигант.

**Когда делать:** при следующей крупной правке Telegram-канала.
Расщепить по типам updates: `handlers/message.ts`, `handlers/reaction.ts`,
`handlers/edited.ts`, `handlers/media-group.ts`. Тесты на сценарии —
до распила (сейчас покрытия минимум).

### A8. Edge Function telegram-send-message — 1089 строк

Отправка + HTML-форматирование + редактирование + удаление + reply +
edge-кейсы Telegram API. Часть форматирования уже вынесена в
`_shared/htmlFormatting.ts`, но логика отправки сама большая.

**Когда делать:** одновременно с A7 — общая стратегия для TG-функций.

### A9. Старый telegram-webhook (735 строк) — проверить, не мёртв ли

В комментарии миграции `20260503_telegram_mtproto.sql:7` говорится «через
telegram-webhook» (без v2). Возможно, ещё используется для бот-секретаря
старой схемы, возможно — мёртвый код после миграции на v2. Проверить
живой ли webhook URL у TG-бота, если нет — удалить.

### A10. queryKeys.ts — 823 строки (Зона 6)

Монолит с 40+ группами ключей. Не блокер, но при росте до 1000+ строк
поиск/правки станут болью.

**Что делать:** разбить на `queryKeys/projects.ts`, `queryKeys/messenger.ts`,
`queryKeys/inbox.ts`, etc., re-export через index.

### A11. Топ файлов 450–500 строк — кандидаты в очередь

Не критично сейчас, но фон растёт:

- `supabase/functions/generate-block/index.ts` (662)
- `supabase/functions/_shared/knowledgeRag.ts` (607)
- `supabase/functions/telegram-business-webhook/index.ts` (590)
- `supabase/functions/email-internal-send/index.ts` (573)
- `supabase/functions/google-docs-export/index.ts` (552)
- `supabase/functions/generate-project-digest/index.ts` (549)
- `mtproto-service/src/routes/commands.ts` (546)
- `supabase/functions/wazzup-webhook/index.ts` (517)
- `src/components/tasks/TaskPanelTabBar.tsx` (491)
- `src/components/projects/DocumentKitsTab/hooks/useDocumentKitSetup.ts` (489)
- `src/components/templates/project-template-editor/ProjectTemplateStatusesSection.tsx` (481)
- `src/components/boards/BoardListCard.tsx` (470)
- `src/components/boards/ListSettingsAppearanceTab.tsx` (465)
- `src/components/messenger/MessageBubble.tsx` (463)

**Правило:** ничего не трогаем «просто потому что большой». Распиливать
только при следующей предметной правке внутри файла.

### A12. shadcn `<button>` vs `Button` (Зона 6)

395 нативных `<button>` рядом с импортом shadcn `Button` в той же
кодовой базе. Темизация и hover-стили расходятся.

**Что делать:** прицельно по UI-компонентам (`status-dropdown.tsx`,
`date-picker.tsx`, `inline-edit-cell.tsx`, `FilterValueSelect.tsx`)
заменить на `Button` с нужным `variant="ghost"/"outline"`.
Не делать массово — сломаешь в 10 местах за раз.

---

## 🟡 Низкий приоритет / фон

- **A13.** `DROP TABLE wazzup_outgoing_dedup` без `IF EXISTS` в
  `20260504_external_outgoing_dedup.sql:19` — косметика.
- **A14.** 21 `as any` в тестах — моки Supabase. Сделать
  `supabaseMock.types.ts` с типизированным helper'ом.
- **A15.** `aiSessions` в `localStorage` накапливаются без cleanup
  при смене воркспейса (Зона 5).
- **A16.** `module_access` в ролях vs `enabled_modules` проекта —
  работает через OR, но связь не задокументирована (Зона 7).
- **A17.** Мутации через `createMutation` не покрыты интеграционными
  тестами (Зона 8).
- **A18.** Осиротевший тип `DialogBaseProps` в `src/types/dialogs.ts`
  не импортируется нигде. Удалить или задокументировать.

---

# Аудит 2026-05-11 — ночной полный прогон

Второй полный аудит после первого. Прошёл по 11 зонам последовательно
(infra.md vs код, refactoring.md vs реальность, безопасность глубоко,
мёртвый код, крупные файлы, унификация, схема БД, React Query, edge
functions, тесты/lint, права/портальная часть).

## Сводка по статусам

| Пункт | Статус | Где смотреть |
|-------|--------|--------------|
| **B1-B3** infra.md рассогласования | ✅ closed | коммит af7aef0 — переписан раздел про TG Business/Wazzup/Personal Dialogs, обновлены роуты до 62, обновлена категоризация Edge Functions |
| **B4** refactoring.md `middleware.ts` → `proxy.ts` | ✅ closed | af7aef0 |
| **D1** мёртвый KnowledgeChat + 5 саттелитов + 3 хука | ✅ closed | af7aef0 (−1576 строк) |
| **D2** мёртвый `documents/dialogs/MergeDocumentsDialog.tsx` | ✅ closed | af7aef0 |
| **D3** 3 мёртвых barrel-файла | ✅ closed | af7aef0 |
| **D4** `KnowledgeSourceInResponse` type-alias | ✅ closed | af7aef0 |
| **D5** deprecated `inboxKeys.threadsV2` алиас + 11 callers | ✅ closed | af7aef0 |
| **G1** 70 unindexed FK | ✅ closed | 5e8531b — миграция `20260511_unindexed_fk_indexes.sql` |
| **G2** RLS initplan на `project_participants` | ✅ closed | 5e8531b — `(SELECT auth.role())` |
| **F2** Security: dynamic CORS в `_shared/edge.ts` | ✅ closed | 5d55003 + a2b0182 — 8 функций мигрированы на whitelist |
| **F3** Унификация `ChatEmptyState` (2 одноимённых компонента) | ✅ closed | 67bca17 — переименованы в `MessengerEmptyState` / `AiChatEmptyState` |
| **G3** 84 multiple_permissive_policies | 🟡 отложено | требует ручного разбора каждой пары полиси, большой scope |
| **G4** `docbuilder`/`docbuilder-covers` public buckets | ⚪ by design | публичные специально для шаринга обложек документов |
| **G5** 107 unused indexes | 🟡 отложено | по плану — через 1-2 месяца наблюдения на проде |
| **E** крупные файлы (`telegram-webhook-v2` 2227 строк и др.) | 🟡 отложено | требует браузерной верификации, рискованно |
| **F4** оставшиеся 10+ edge functions с wildcard CORS | 🟡 отложено | `fetch-sheets`, `google-oauth-*`, `translate-block`, `analyze-documents`, `generate-block`, `provision-domain`, `fetch-image`, `sandbox-test` и др. — миграция точечная по запросу |
| **B5** проверить пометки в инфре про реакции в TG Business | 🟡 отложено | детали Bot API, у меня нет доступа к актуальным changelog'ам |

## Метрики

- **−1576 строк** мёртвого кода удалено
- **+70 индексов** на foreign keys
- **8 edge functions** мигрированы на dynamic CORS-whitelist
- **3 RLS-политики** оптимизированы (initplan)
- vitest: 630/630 ✓ (без регрессий)
- eslint: 0 ошибок ✓
- 7 коммитов в `main`

## Что точно НЕ нужно делать (этой волной)

- **Не распиливать** `telegram-webhook-v2/index.ts` без браузерной
  верификации. Файл монолит, но логически разделён комментариями-секциями.
  Распил даст +5 файлов, риск регрессии в production — низкая
  читаемость не оправдывает.
- **Не трогать** `_shared/cors.ts` whitelist — он уже корректный.
- **Не удалять** `sandbox-test` — это dev playground, не используется
  во фронте, но полезен для отладки на работающем supabase.
- **Не консолидировать** `multiple_permissive_policies` без понимания
  бизнес-логики каждой — это может убрать важные разрешения и сломать
  права.

---

# Аудит 2026-05-11 (волна 3) — закрытие отложенных пунктов

После предыдущих двух волн оставались 7 пунктов, отложенных как «риск
без подтверждения». Пользователь явно дал зелёный свет («без моих
подтверждений, утром проверю»). Все закрыты:

| Пункт | Статус | Коммит | Комментарий |
|-------|--------|--------|-------------|
| **A10** разбить `queryKeys.ts` на модули | ✅ closed | 96153e9 | Монолит 913 строк → 13 тематических модулей. Старый файл удалён, импорты `from '@/hooks/queryKeys'` резолвятся на новый `queryKeys/index.ts` barrel. Без поломки импортов. |
| **A14** типизированный supabaseMock helper | ✅ closed | 625bacc | Создан `src/test/supabaseMocks.ts` с `mockSupabaseRpc`, `setSupabaseRpcMock`, `setSupabaseAuth`. 19 `(supabase.rpc as any)` + 5 `(supabase as any).auth` → 0 кастов. Остался 1 `as any` в `useFormKitFilter.test.ts` (test factory, не supabase — приемлемо). |
| **A15** aiSessions cleanup при смене WS | ✅ closed | a3aa1d5 | В `setContext` теперь при смене `workspaceId` чистим `aiSessions = {}` из памяти. localStorage с persistedConversations остаётся — при возврате на проект `getAiSession()` отбилдит. +2 теста на новое поведение. |
| **A11/A12** `<button>` vs shadcn `Button` | ✅ closed (false positive) | — | После анализа всех 8 кейсов в `src/components/ui/` — намеренная кастомизация без `Button` дефолтов (`segmented-toggle`, `inline-edit-cell`, `status-dropdown` trigger, etc.). Замена ухудшит код / принесёт визуальные регрессии. |
| **A8** распил `telegram-send-message` | ✅ closed | 9373452 | 1089 строк → 3 файла: `index.ts` (~560), `helpers.ts` (~70: utility funcs + `loadReplyQuoteHtml`), `attachments.ts` (~420: `resolveAttachment`, `sendAttachments`, `sendAttachmentsWithFallback`). Поведение не менялось. |
| **A7** распил `telegram-webhook-v2` | ✅ closed (частично) | d972f83 | Вынесены типы (`types.ts` ~106 строк) и pure-helpers (`pure.ts` ~181 строк). Главный handler (~2000 строк) остался — там глобальные `service`/`BOT_TOKEN`/`sendMessage`, распил требовал бы переписать сигнатуры. Это backlog item для следующей волны. |
| **A17** интеграционный тест мутаций | ✅ closed | db8362b | Добавлен `useProjectServices.test.ts` — 5 тестов на связку `create/update/patch/delete → invalidateQueries → projectServiceKeys.list(projectId)`. Если ключ переименуют в реестре — тест упадёт. Эталон для добавления таких же на другие хуки мутаций. |

## Итого по 3 волне

- queryKeys.ts разбит на 13 модулей (+barrel)
- 19 `as any` в тестах устранены через типизированный helper
- aiSessions memory leak закрыт
- telegram-send-message 1089 → 560 в главном handler'е
- telegram-webhook-v2: вынесены типы и pure
- +5 интеграционных тестов мутаций как эталон
- 0 регрессий: vitest 637/637, eslint 0

Все коммиты в `main`: `96153e9, 625bacc, a3aa1d5, 9373452, d972f83, db8362b`.

## Что ОСТАЛОСЬ открытым после волны 3

- **A7 (продолжение)**: ~1800 строк бизнес-логики в `telegram-webhook-v2/index.ts` (knowledge, upload-slot, callbacks). Распил требует переписать `service`/`BOT_TOKEN`/`sendMessage` как параметры функций или экспортировать из state-модуля. Делать только когда нужна правка внутри.
- **G3, G5, F4, B5** из волны 2 — статус не изменился.
