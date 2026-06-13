# Аудит архитектуры и поддерживаемости — 2026-06-13

5 агентов (read-only) прошли по измерениям: слои/зависимости, state-менеджмент,
сервисы/типы, компоненты/конвенции, cross-cutting maintainability. Карантин
(мессенджер/email/mtproto) — анализировался только на наблюдения, помечен [КАРАНТИН].

**Вывод верхнего уровня:** архитектура **здоровая и зрелая**. Катастроф нет:
граф импортов почти ацикличен (0 cross-layer циклов на ~1300 файлах), `app/`
строго на вершине, single-source query-ключей, единые тосты/диалоги, честный
strict (`any`/`@ts-ignore` в проде = 0). Ниже — техдолг-рефайнменты, сгруппированы
в 5 тем + 1 реальный мелкий баг приватности.

---

## 🔴 P0 — реальный баг (не архитектура): утечка черновиков на общем браузере

`src/store/sidePanelStore.localStorage.ts:35-54` (`lsClearPanelKeys`) при logout
чистит **жёстко перечисленный** набор `cc:*`-ключей. Но черновики сообщений
`msg_draft:<threadId>` / `msg_outbox:<threadId>` (`useDraftMessage.ts:26,73`,
`useSendMessage.ts:222`) в список **не входят** и scope у них только по `threadId`
(не по user_id). → На общем компьютере следующий пользователь видит **чужой
неотправленный черновик**. (Плюс не чистятся `cc:last-workspace-id`,
`cc:sidebar-collapsed` и др. — но те безвредны.)

**Фикс:** единый префикс `cc:` для ВСЕХ persist-ключей (вкл. черновики) + очистка
циклом по `key.startsWith('cc:')`; либо явный реестр всех ключей в одном модуле,
на который ссылается `lsClearPanelKeys`. Низкий объём, высокий эффект.

---

## 🟠 T1 — Доменная модель и «движок документов» застряли в UI-слоях (самый дорогой долг)

Сошлось у 3 агентов. Корень — **размытая граница `src/hooks/` vs колоцированных
`components/**/use*.ts` (127 файлов)** и доменная модель в `components/`.

- **Типы/предикаты домена в `components/`:** `components/documents/types.ts` (модель
  `Document`/`Folder` + рантайм `TABLE_COLUMN_WIDTHS:47`, `isStatusUnselected:108`)
  и `components/forms/types`. На них завязаны 63 файла, в т.ч. `services/documents/types.ts`,
  `store/documentKitUI/types.ts:11`, 12 хуков `hooks/documents/*`, 7 `hooks/forms/*`.
  Рантайм-импорты (`isStatusUnselected`, `isRiskLevel`) из компонентов в хуки —
  настоящая инверсия (компонентный модуль в бандле).
- **Домен «Документы» физически расщеплён на 2 каталога:** `components/documents/`
  (DocumentRow/SlotRow/FolderSection) **и** `page-components/ProjectPage/components/Documents/`
  (DocumentItem/SlotItem/FolderCard + DocumentsContext + hooks). Пересекающиеся имена,
  «настоящий движок» (DnD/upload) в page-private папке.
- **`components/` тянет внутренности `page-components/ProjectPage/`** (7 файлов:
  `PanelDocumentsContent.tsx:12,17`, `plan/PlanDocsProvider.tsx:21-31`, `PlanSortableRow.tsx:19`,
  `tasks/PanelProjectInfoRow.tsx:21`, `WorkspaceSidebarFull.tsx:32`, `ProjectsList.tsx:11`).
- **`services/` определяют DTO через тип из хука:** `boardFilterService.ts:16-17`
  (`WorkspaceTask` из хука, `BoardProject` из компонентного хука), `taskPanelTabsService.ts:12`.
- **`store/documentKitUI/types.ts:11`** тянет `ExportDocument` из вложенного диалога
  `ProjectPage/.../ExportProgressDialog`.

**Чем вредит:** нижние слои (services/hooks/store) нельзя переиспользовать/тестировать
без захода в UI; правка структуры одной страницы ломает 7 несвязанных мест; домен
документов в 2 местах → риск чинить баг в одной копии.

**Направление (поэтапно, не кампанией):**
1. Вынести доменные типы + чистые предикаты/константы документов и форм в `src/types/`
   или `src/lib/<domain>/`; `components/.../types.ts` оставить тонким реэкспортом.
2. Определить единый дом домена «Документы» (вероятно `components/documents/` + туда
   `DocumentsContext`/hooks); page-обёртка импортит движок из общего слоя, не наоборот.
3. Зафиксировать правило в `infrastructure.md`: «`hooks/` НЕ импортит из `components/`;
   общие хуки — в `src/hooks/`, фиче-локальные — colocated».
4. DTO (`WorkspaceTask`, `BoardProject`, `ExportDocument`) объявлять в `services/`/`types/`,
   хуки/диалоги реэкспортят вниз.

Приоритет внутри темы: сначала пункт 1 (вынос типов вниз) — снимет половину инверсий разом.

## 🟠 T2 — Доступ к БД не централизован (сервис не единственный шлюз)

- **68** inline `supabase.from` в `hooks/`+`components/`+`page-components/` против **23**
  в `services/`. Граница плывёт ВНУТРИ модуля: у documents/forms есть и сервис, и хуки
  с прямым `supabase.from` (`useDocumentMutations`, `useFormKitSave`, …).
- **31 `.tsx`-компонент** зовёт `supabase.from/rpc/storage/invoke` прямо в рендере
  (`EditParticipantDialog`, `AutoFillFormDialog`, шаблонные `*Content`, `WorkspacesPage`,
  `ProfilePage`, …) → их нельзя протестировать без мока supabase в render-тесте.

**Чем вредит:** при смене схемы БД нет единого места правки query-shape/ошибок/инвалидации;
непоследовательная обработка ошибок (часть через `safe*OrThrow`+`AppError`, часть голый
`if(error) throw`); подтачивает тестируемость.

**Направление:** правило в `data-model.md` — «чтения/записи доменных сущностей через
`src/services/<module>`; хук = React Query + вызов сервиса; supabase в компоненте не зовём».
Стягивать inline-`from` в сервисы **органически при правках**, не разом.

## 🟠 T3 — Дырявая типобезопасность записи (`as never`)

Strict честный (`: any`/`as any`/`@ts-ignore` в проде = 0), но:
- **2 лишних `as never` на RPC** [КАРАНТИН]: `useChatState.ts:70`, `useFilteredInbox.ts:45` —
  `supabase.rpc('get_chat_state' as never, {...} as never)`, хотя оба RPC корректно
  типизированы в `database.ts`. `as never` гасит проверку имени RPC и формы аргументов
  целиком → опечатка в параметре всплывёт в рантайме. Убрать оба (оставить `data as unknown as T`).
- **~30 `as never` на write-payload** (`.update(rec as never)`/`.insert(p as never)`):
  `BulkActionsBar.tsx` ×3, `useFieldDefinitionForm.ts` ×4, `useSlotsEditorMutations.ts` ×2,
  `auditService.ts:65,68`, `knowledgeConversationService.ts` ×3, `useItemLists.ts:170`, …
  Payload собран как `Record<string, unknown>` → `as never` пропускает любую форму →
  опечатка в имени колонки не ловится. Фикс: типизировать через
  `Partial<Database['public']['Tables']['<t>']['Update']>` (примитив `ProjectUpdate` уже
  есть в `entities.ts`).
- **`comments.ts:15-29`** — ручной тип поле-в-поле дублирует `Tables<'comments'>['Row']`
  (кроме `entity_type` union — это легитимно). Фикс: `Omit<Tables<'comments'>,'entity_type'>
  & { entity_type: CommentEntityType }`.

**Что НЕ баг:** 97 прод-`as unknown as` — в основном мост Supabase-генерик ↔ доменный тип
на границе RPC/JSON (`inboxService` ×7, `castToProjectMessage` — образцово документированы).
183 в тестах — мок-паттерн. By-design.

## 🟠 T4 — Скрытые контракты «на дисциплине, а не на компиляторе»

Кроме P0-утечки выше:
- **Accent-карта `Record<string>` вместо `Record<ThreadAccentColor>`** [часть КАРАНТИН]:
  канон `ACCENT_COLORS` (10 ключей) в `threadConstants.ts`. Карты в `chatVisuals.ts:22`
  типизированы строго (TS поймает пропуск ключа), а `UnreadBadge.tsx:18`, `TimelineFeed.tsx:323,336`,
  `InboxChatHeader.tsx:44` — `Record<string,string>` → добавление 11-го accent **не даст
  ошибки компиляции**, молчаливый фолбэк. Фикс: `Record<ThreadAccentColor>` везде —
  превращает 13 ручных синхронизаций в compile-time (совместимо с by-design «карты раздельны»).
- **Логические сравнения по raw-именам ролей** (`=== 'Клиент'`, `name === 'Владелец'`):
  ~63 литерала русских имён ролей при наличии `SYSTEM_*_ROLES` (`permissions.ts:257-272`).
  UI-лейблы (`roleConfig.ts` — иконки) оставить (роли в БД идентифицируются по имени —
  архитектурный факт), но **логические сравнения** перевести на `SYSTEM_*_ROLES.*`.
- **Мёртвый кластер ключей `taskKeys.urgentCount`** (`queryKeys/misc.ts:60-64`):
  инвалидируется в 6 местах (`useCalendarThreads:160`, `useTrash:337`,
  `useProjectThreads.mutations:186,267,278`, `TaskListView:218`), **не читается нигде** —
  живой счётчик это `myTaskCountsKeys`. Cargo-cult инвалидации копируются в каждую новую
  мутацию. Удалить ключ + 6 инвалидаций (+ проверить RPC `get_my_urgent_tasks_count` на дроп).
- **Дубль определения ключа** `['project-template-id', projectId]`:
  `projects.ts:111` (`projectTemplateKeys.idByProject`) и `templates.ts:35`
  (`templatesForRoutingKeys.templateIdForProject`) — идентичны. Оставить одно каноническое.

## 🟡 T5 — Организационные/конвенционные несоответствия + doc-дрейф

- **3 routed-страницы в `components/`, а не `page-components/`:** `ProjectTemplateEditorPage`,
  `DocumentKitTemplateEditorPage`, `FormTemplateEditorPage/` (импортятся прямо из `app/.../page.tsx`).
- **4 стратегии размещения фиче-хуков:** colocated `<feature>/hooks/` (boards, directories),
  colocated без папки (templates), `src/hooks/<feature>/` (forms/knowledge/tasks), top-level
  (`useItemLists`). Зафиксировать одно правило.
- **Разнобой суффиксов:** `*Directory` (directories) vs `*Content` (templates) для одной роли.
- **69 hardcoded route-строк** `/workspaces/${id}/...` без реестра `ROUTES`/`buildRoute`.
- **Doc-дрейф:** `src/hooks/queryKeys.ts` теперь директория `queryKeys/` — 3 дока ссылаются
  на старый файл (`infrastructure.md:45`, `refactoring.md:82`, `CLAUDE.md:101`).
- **Edge-контракты покрыты ~18%** (`edgeContracts.ts` 6 из 65 invoke; 50 возвращают `data: any`) —
  полу-by-design, заводить контракт при касании.
- **`useUpdateThreadTime` (`useCalendarThreads.ts:117-164`)** — единственная optimistic-мутация
  без `onError`-rollback (эталон рядом — `threadCacheSync.ts:84-103`).
- **`history.ts:38`** `source: 'web'|'telegram'|'email'` — урезанная копия `ProjectMessage.source`
  (9 значений). Live-бага нет, но дезориентирует.
- **Литералы query-ключей вне фабрики:** модуль `residence/*` (`['residence',...]`) — завести
  `residenceKeys` до расползания.

---

## Что проверено и признано ЗДОРОВЫМ (не findings)
- Граф импортов почти ацикличен (2 цикла, оба внутри `components/tasks/`, рантайм-безопасны
  через `import type`/`React.lazy`); `app/` строго на вершине; `lib/contexts/utils` чисты.
- Zustand-сторы чистые, сбрасываются при logout/смене воркспейса, селекторы используются,
  серверного состояния не держат.
- Фабрики query-ключей дисциплинированы; `*.all` broad-префиксы намеренны; `boardFilteredKeys`
  вложенность — грамотное решение для partial-match.
- Тосты — 100% sonner; диалоги — единообразно shadcn `Dialog`+`ConfirmDialog`; контексты по делу,
  без over-engineering; god-компонентов с логикой-в-теле нет (крупные файлы — оркестраторы).
- Сервисы без god-объектов (макс 395 строк); зрелая инфра ошибок (`AppError`+`safe*OrThrow`).
- Обработка ошибок консистентна; пустых `.catch(()=>{})` всего 5, безвредны.

## Лог выполнения (2026-06-13)
- **P0** ✅ — утечка черновиков: `lsClearPanelKeys` sweep по префиксам `[cc:, msg_draft:, msg_outbox:]` +тест.
- **T3** ✅ — 16 `as never` убраны (RPC-cruft, write-payload через `TablesInsert/Update`+`as Json`, enum-каст). Оставлены 4 обоснованных (динамич. union-таблицы + carantine RPC).
- **T4** ✅ — мёртвый `taskKeys.urgentCount`-кластер удалён (+6 инвалидаций, тест обновлён на живой `my-task-counts`); дубль-ключ `templateIdForProject` → `projectTemplateKeys.idByProject`; accent-карты `Record<ThreadAccentColor>` в 3 не-карантинных (UnreadBadge, TimelineFeed, InboxChatHeader). **НЕ трогал карантинные accent-карты** (ReactionBadges/MessageInputToolbar/threadConstants): их локальный `MessengerAccent` имеет legacy-алиасы (`green`/`dark`), которых нет в картах → `Record<MessengerAccent>` не подходит, а `Record<ThreadAccentColor>` потребует доп. кастов против MessengerAccent; + карантин. Оставлены как есть.
- **T1/T2/T5** — ниже, в работе.

## Приоритет правок (предложение)
1. **P0** — утечка черновиков (быстро, приватность).
2. **T3** — убрать 2 RPC `as never` [смок] + типизировать write-payload + `comments.ts`.
3. **T4** — `Record<ThreadAccentColor>` + удалить мёртвый `taskKeys` + дубль-ключ.
4. **T1** — вынос доменных типов вниз (этап 1) — стратегически, отдельной сессией.
5. **T2/T5** — конвенции в доках + дрейф «по пути».
