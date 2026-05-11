# Документы, авто-прочтение, карточка контакта, email-автозадачи

**Дата:** 2026-05-11
**Тип:** feat + fix
**Статус:** completed

---

## Контекст

Пакетная итерация по разным мелким болям, которые накопились за день
работы с инбоксом и досками:

- Кнопка «Переместить вниз» у наборов документов не работала.
- При переводе треда в финальный статус непрочитанные не гасились.
- В личном email-диалоге фронт показывал email вместо имени контакта,
  даже после переименования.
- На досках карточки с длинным названием выглядели плохо: бейдж висел
  не по центру, проект забирал всю ширину, имя контакта вообще не
  показывалось для тредов без проекта.
- Открыть тред без проекта (личный диалог) на доске не получалось —
  панель «дёргалась», но оставалась на старом треде.
- Каждый раз когда приходит письмо — хочется чтобы оно автоматом
  становилось задачей: с исполнителем=я, со сроком на сегодня.
- Карточку контакта хотелось переименовывать сразу из быстрого диалога
  и переходить из неё в полный редактор; плюс открывать карточку
  кликом по аватарке/имени в баблах.
- Авто-созданные контакты (из webhook'ов) получали пустую роль — для
  фильтров и UI это было неудобно.

Все правки изолированные, но в сумме это около 17 коммитов и 5 миграций.

## Решение

### 1. Документы проекта — перемещение наборов вверх/вниз

**Корень бага:** RPC `create_document_kit_from_template` не выставлял
`sort_order` — все наборы создавались с дефолтом 0. Swap двух нулей при
«Переместить» ничего не менял.

- **Миграция-бэкфилл:** пронумеровал `sort_order` (0..N-1) по `created_at`
  для каждого проекта.
- **RPC:** при создании набора `sort_order = MAX + 1` в рамках проекта.
- **`useMoveDocumentKitMutation` (фронт):** после swap'а перенумеровывает
  весь список (0..N-1). Страховка от любых будущих коллизий — даже если
  опять появятся дубликаты, после первого «переместить» порядок
  нормализуется.

Файл: `supabase/migrations/20260511_document_kits_sort_order_fix.sql`

### 2. Автопрочтение треда при переходе в финальный статус

Раньше логика жила только в `useUpdateTaskStatus`. При смене статуса
из настроек чата, через bulk-операции в списках или прямым SQL —
unread оставался.

**Фронт — единый хук `useMarkThreadReadIfFinal`:**

- Проверяет `statuses.is_final`.
- Резолвит participant'а: проектный (если у треда `project_id`) или
  workspace-уровневый (для личных диалогов).
- Вызывает `markAsRead` + точечно гасит:
  - `messengerKeys.unreadCountByThreadId` (счётчик треда).
  - `inboxKeys.threads(workspaceId)` (бейджи в inbox v2) — с отменой
    in-flight рефетчей realtime-подписки.
  - `messengerKeys.lastReadAtByThreadId` и `lastReadAtByProjectPrefix` —
    чтобы красная полоса на конкретных баблах сходила моментально.

Подключён в трёх точках:

- `useTaskMutations.useUpdateTaskStatus` (заменил inline-код, минус 50 строк).
- `useChatSettingsMutations.updateStatusMutation`.
- `BulkActionsBar.setThreadStatus` (по каждому треду в выборке).

**БД-триггер `mark_thread_read_on_final_status` — backstop:**

`AFTER UPDATE OF status_id ON project_threads` — если новый статус
финальный, по `auth.uid()` находит participant'а (проектного или
workspace-уровневого для personal-тредов) и делает upsert в
`message_read_status`. Гарантия, что запись появится при ЛЮБОМ пути
смены статуса (включая прямой SQL, пакетные операции, будущие точки).
Service-role вызовы (`auth.uid()=NULL`) триггер пропускает.

Файлы:
- `src/hooks/messenger/useMarkThreadReadIfFinal.ts` (новый)
- `supabase/migrations/20260511_mark_thread_read_on_final_status.sql`

### 3. Inbox v2 — counterpart_name по email

`get_inbox_threads_v2` падал на fallback `sender_name` (= email
отправителя), когда у входящего email-сообщения `sender_participant_id =
NULL`. После переименования контакта в карточке имя в списке тредов на
досках/в `/lists` не менялось.

Добавил JOIN participants по email из двух источников:

- `project_thread_email_links.contact_email` — для проектных email-тредов.
- `project_threads.email_last_external_address` — для личных диалогов
  без проекта.

Теперь `counterpart_name = NULLIF(TRIM(name||' '||last_name), '')`.
Аватарка тоже подтягивается из participant'а.

Файл: `supabase/migrations/20260511_inbox_v2_counterpart_by_email.sql`

### 4. Карточки на досках и в списках — куча мелких правок

#### 4.1. Поле «Проект» — fallback на имя контакта

Для тредов без проекта вместо пустого поля показываем `counterpart_name`
из inbox v2 (через новый хук `useThreadCounterpartName`, подписан на кэш
`useInboxThreadsV2` через `useSyncExternalStore` — тот же паттерн, что
у `UnreadBadge`, без своего `queryFn`).

Подключено в `BoardTaskRow` (карточки) и `ItemListsPage/ThreadRow`
(таблицы).

#### 4.2. Цвет поля «Проект» — светлее

`text-muted-foreground` → `text-muted-foreground/60`. Уходит на второй
план, бейдж и название треда становятся главными.

#### 4.3. Unread-бейдж — центрирование в строке

В баблах-обёртках `<div>` вокруг `<span>` бейджа высота вычислялась по
line-height inline-контента (текст «2»), а не по `h-[18px]` span'а.
`items-center` row центрировал обёртку, но внутри обёртки сам span был
сдвинут вниз на 2-3px. Добавил `flex items-center` на обёртку — теперь
её высота = высоте span'а. Проверено через DOM: `diff_badge_vs_status = 0`.

Промежуточный коммит сначала пытался вынести бейдж на уровень всей
карточки (для двухстрочного режима), но пользователь поправил — бейдж
должен оставаться в той строке, в которой он лежит по layout, а
проблема была в верстке самого бейджа.

#### 4.4. Пропорция name / project — 60/40 при нехватке, прижато при коротких

Раньше project (`shrink-0`) забирал всё пространство, а name (`flex-1`
если последнее left-поле) сжимался до 0. В list-режиме название
вообще не помещалось.

Финальный вариант:

- `name`: `min-w-0 truncate` (default flex 0 1 auto).
- `project`: `min-w-0 truncate flexShrink:1.5` (сжимается в 1.5 раза
  сильнее name).

Поведение:

- short name + short project → оба natural width, прижаты после gap.
- long name → name сжимается, project натуральный.
- оба длинные → оба сжимаются, project сильнее (приоритет на name).

Файлы:
- `src/components/boards/BoardTaskRow.tsx`
- `src/page-components/ItemListsPage/ThreadRow.tsx`
- `src/hooks/messenger/useThreadCounterpartName.ts` (новый)

### 5. Email-треды — автоисполнитель и срок «сегодня»

Каждый раз когда приходит письмо — хочется чтобы тред появился как
to-do: исполнитель=я, срок=сегодня. Сделал два БД-триггера, фронт
менять не пришлось.

**При создании email-треда (`BEFORE INSERT`):**

- `deadline IS NULL` → `today_madrid_midnight()` (полночь Europe/Madrid
  в формате timestamptz; фронт показывает «11 мая»).

**При создании email-треда (`AFTER INSERT`):**

- Назначаем `task_assignees` с владельцем ящика:
  - personal email (project_id=NULL) → participant с `user_id =
    thread.owner_user_id`.
  - проектный email → владелец `email_send_account_id` (через
    `email_accounts.user_id`).

**При новом входящем в существующий email-тред (`AFTER INSERT
project_messages`):**

- Считаем входящим если `sender_participant_id IS NULL` или у
  participant'а нет `user_id` (внешний контрагент).
- Тред в финальном статусе → `status_id := NULL` (переоткрытие).
- `deadline IS NULL` → сегодня.
- Нет ни одного `task_assignees` → добавляем владельца ящика.

Существующие deadline и исполнители НЕ перезаписываются — триггер
аккуратно заполняет только пустые поля.

Файл: `supabase/migrations/20260511_email_thread_auto_assignee_deadline.sql`

### 6. Карточка контакта — переименование и переход в полную

Раньше `ContactCardDialog` только показывал имя и переписки, плюс
кнопку «Объединить». Хотелось:

- быстро переименовать контакт после получения нового письма;
- из быстрой карточки попасть в полный редактор (роль, can_login,
  аватар).

#### 6.1. Inline-переименование

В шапке диалога рядом с именем — карандашик. Клик → два поля (имя,
фамилия) с галочкой «Сохранить» и крестиком «Отмена». Enter сохраняет,
Escape отменяет. Новый хук `useRenameParticipant` (`UPDATE participants`
+ инвалидация `participantKeys.{byId, all}`).

Сотрудников (`can_login=true` или `user_id IS NOT NULL`) не редактируем
через эту карточку — у них имя из user_metadata, карандашик скрыт.

#### 6.2. Кнопка «Открыть полную карточку»

Рядом с «Объединить» в `ContactCardDialog`. Открывает существующий
`EditParticipantDialog` (имя/фамилия/email/телефон/Telegram ID/каналы
связи/роль/can_login/аватар).

#### 6.3. Глобальный mount контакт-карточки

`useContactCardStore` (Zustand) + `<GlobalContactCardDialog />` в
`WorkspaceLayout`. Открывать карточку из любого места:
`useContactCardStore.getState().open(participantId)`.

#### 6.4. Клик в баблах сообщений

Аватарка и имя отправителя в баблах теперь кликабельны — открывают
карточку контакта. Для email-сообщений `sender_participant_id` всегда
NULL — добавлен fallback на `project_threads.contact_participant_id`
треда через новое поле `threadContactParticipantId` в `MessengerContext`.
Догружаем тред в `MessengerTabContent` через `useProjectThreadById`
(React Query дедуплицирует запрос).

Файлы:
- `src/components/contacts/ContactCardDialog.tsx`
- `src/components/contacts/GlobalContactCardDialog.tsx` (новый)
- `src/store/contactCardStore.ts` (новый)
- `src/hooks/useContactCard.ts` (новая мутация `useRenameParticipant`)
- `src/components/messenger/MessengerContext.tsx`
- `src/components/messenger/MessengerTabContent.tsx`
- `src/components/messenger/MessageBubble.tsx`
- `src/components/messenger/BubbleHeader.tsx`
- `src/components/WorkspaceLayout.tsx`

### 7. Системная роль «Внешний контакт»

Авто-созданные контакты (webhook'и email/wazzup/telegram) раньше
получали пустой `workspace_roles`. Теперь — роль «Внешний контакт» по
умолчанию; пользователь может позже сменить.

- **Миграция:** роль во все существующие воркспейсы (`is_system=true`,
  все permissions=false, цвет `#94a3b8`).
- **Триггер `add_external_contact_role_to_new_workspace`** на
  `workspaces` — авто-добавление при создании воркспейса.
- **Триггер `set_default_external_contact_role`** на `participants`
  (`BEFORE INSERT`): если `can_login=false` и `workspace_roles` пуст —
  ставим `ARRAY['Внешний контакт']`. Покрывает все будущие источники
  авто-создания без правок в коде webhook'ов.
- **Бэкфилл:** 15 существующих контактов без ролей получили роль.
- **Фронт:** `ROLE_CONFIG`, `EditParticipantDialog DEFAULT_ROLES`,
  `multi-select ROLE_ICONS`. Иконка — `Contact` (lucide).
- В `EXTERNAL_ROLES` (для assignee-пикеров) **не добавляю** — внешний
  контакт не сотрудник, его на задачи не назначают.

Файл: `supabase/migrations/20260511_workspace_role_external_contact.sql`

### 8. Боковая панель — фикс «нельзя открыть тред без проекта на доске»

Сценарий: на `/boards/X` открыт тред с проектом A (URL содержит
`panelTab=thread:<A>`). Юзер кликает тред без `project_id` (личный
email-диалог). `openThreadTab` → `setActiveProjectId(null)` → следующий
рендер `activeProjectId === null`, но URL ещё не успел обновиться.
`useThreadFromPanelTab` асинхронно резолвит СТАРЫЙ `panelTab` и
возвращает projectId старого треда. Эффект `resolvedFromUrl` тут же
возвращал scope обратно на A — `pendingOpen` для нового треда
отбрасывался guard'ом. Панель «дёргалась», но оставалась на старом.

Первая попытка (через `appliedUrlThreadRef`) не сработала — async-резолв
заходил после клика, ref ещё пустой, эффект применял старый projectId.

Финальный фикс: `userInteractedRef` — взводится в `openThreadTab` и
`openProjectTab`. Раз пользователь руками открыл тред — URL-резолвер
больше scope не трогает.

Файл: `src/components/tasks/TaskPanelTabbedShell.tsx`

## Тестирование

- **Документы:** проверено в БД для проекта Кирилла (3 набора), swap
  «Переместить вниз» → «Переместить вверх» возвращает исходный порядок.
- **Автопрочтение:** проверено triggers через тестовое UPDATE +
  message_read_status; в браузере красная полоса на баблах сходит после
  перевода в финал.
- **Карточки досок:** через DOM-замеры — diff_badge_vs_status = 0,
  пропорция name/project 170:114 (~60/40).
- **Email-автозадача:** создал тестовый email-тред, deadline ушёл в
  «2026-05-10 22:00 UTC = 2026-05-11 00:00 Madrid», assignee = Кирилл.
  При повторном входящем — переоткрыло финальный статус, deadline и
  assignee при повторе не перезаписаны (поставленные вручную сохранены).
- **Карточка контакта:** «Olive tree» переименован → «Olive Tree School
  (Saray)» через inline-редактор, в БД обновилось. Полная карточка
  открывается поверх с email/phone/telegram/role полями.
- **Боковая панель:** ручная проверка пользователем — переключение
  между тредом проекта и личным email-диалогом теперь работает.

## Известные ограничения

- Бэкфилл «Внешний контакт» обработал только participants с пустыми
  ролями. Контакты с уже выставленной ролью (например, «Клиент»)
  оставлены как есть — это by design.
- Триггер `mark_thread_read_on_final_status` не работает при вызовах
  от service-role / pg_cron (там `auth.uid()=NULL`). Это by design —
  фоновому коду не нужно «помечать прочитанным» от чьего-то лица.
- Хук `useThreadCounterpartName` читает `counterpart_name` из кэша
  inbox v2 — если inbox ещё не загружен, fallback на пустое значение
  (UI рисует «—» или ничего). Не критично — inbox v2 загружается на
  большинстве страниц через `useInboxThreadsV2`.
