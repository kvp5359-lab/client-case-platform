# Интеграция с Google Calendar: чтение, запись, зеркалирование задач, convert

**Дата:** 2026-05-18
**Тип:** feature (large) + migration (db) + fix (sync cron)
**Статус:** completed

---

## Контекст

После того как 2026-05-17 заработал календарный режим списков с собственными
задачами, следующий шаг — интеграция с Google Calendar:

1. **Чтение** — события из Google в виде второго слоя на той же сетке, что
   и наши задачи. Per-user визибилити (события приватные).
2. **Запись** — drag/resize события из сервиса должны лететь в Google.
3. **Обратное зеркалирование** — задачи сервиса, у которых заполнены
   start_at/end_at, должны автоматически появляться в Google-календаре
   сотрудника.
4. **Convert** — событие из Google можно одним кликом превратить в задачу
   проекта со связкой 1-к-1.

Также по дороге всплыл и пофиксен старый баг в pg_cron-джобе:
`google-calendar-sync` стабильно возвращал 401 «Invalid JWT» из-за
неверного формата Bearer-ключа в команде крона. Перевели на
`x-internal-secret`-аутентификацию.

## Главное 1: чтение Google Calendar

### Архитектура

Три новые таблицы:

- **`google_calendar_tokens`** (user_id PK, access_token, refresh_token,
  expires_at, google_email) — OAuth-токены пользователя для scope
  `https://www.googleapis.com/auth/calendar` (полный read+write,
  изначально был readonly — апгрейд на 2026-05-18). Отдельная таблица
  от `google_drive_tokens`, потому что scope-ы наслаиваются независимо.
- **`calendars`** (id, workspace_id, owner_user_id, source ∈ {internal,
  google}, google_calendar_id, google_account_user_id, color, name) —
  «календарь» как сущность нашей системы. Может быть internal (для
  будущих внутренних) или google (привязка к конкретному Google Calendar).
  **Personal-видимость**: RLS даёт SELECT только владельцу и владельцу
  воркспейса. Workspace participants чужие календари не видят.
- **`external_calendar_events`** (id, calendar_id, external_id, title,
  start_at, end_at, html_link, …) — кэш событий из внешних источников.
  Заполняется sync-функцией. RLS наследуется от calendar (видно тому же,
  кому видно сам календарь).

### Edge Functions

- **`google-calendar-auth`** — стартует OAuth-flow. Возвращает authUrl
  для попапа. Scope: `calendar` + `calendar.calendarlist.readonly` +
  `userinfo.email`.
- **`google-calendar-callback`** — exchange code → tokens. После
  записи токенов шлёт postMessage в opener и закрывается. Деплой
  `--no-verify-jwt` (вызывается напрямую из браузера Google).
- **`google-calendar-list`** — выкачивает список Google-календарей
  пользователя для UI (через `calendarList.list`).
- **`google-calendar-sync`** — синхронизация событий за окно
  `[now-30d, now+90d]` в `external_calendar_events`. Поддерживает два
  режима auth: Bearer JWT (ручной sync из UI) и `x-internal-secret`
  (pg_cron). Deploy `--no-verify-jwt`.

### pg_cron `google-calendar-sync` — фикс

Крон вызывал функцию с `Authorization: Bearer sb_secret_...` (новый
формат Supabase API keys), но шлюз отбивал с 401 «Invalid JWT» —
видимо, ключ был усечён или не из той вкладки. **Фикс:** функцию
переразвернули с `verify_jwt=false`, крон переписали на
`x-internal-secret` (тот же секрет, что и у telegram-send и компании).
Теперь синк отрабатывает каждые 10 минут, статус 200, ~119 событий
upserted на тестовом аккаунте.

### UI

В `IntegrationsTab` добавлена секция «Google Calendar»
([`GoogleCalendarSection.tsx`](../../src/page-components/workspace-settings/IntegrationsTab/GoogleCalendarSection.tsx)):

- Если не подключён → кнопка «Подключить Google Calendar».
- После подключения → список Google-календарей пользователя с
  кнопкой «Добавить» (создаёт `calendars` row).
- Снизу — список календарей воркспейса (у `owner_user_id = current_user`),
  каждый с 🔄 (ручной sync) и 🗑 (удалить).
- Кнопка «Переподключить» — для апгрейда scope-а (с readonly на full
  calendar, нужно после 2026-05-18).
- Селектор «Зеркалить мои задачи в Google Calendar» (см. ниже).

В `BoardListCalendarView` параметр `settings.calendar_ids: string[]`
позволяет на конкретном календарном списке выбрать какие
календари-источники наложить поверх задач. События мерджатся с тасками
в единый массив `events`, рисуются цветом своего календаря.

### Personal visibility — почему так

Изначально календари были workspace-shared: добавил один — видят все
участники. После теста пользователь попросил «события должны быть
видны только мне» — лично-приватная информация.

Миграция [`20260518_google_calendar_personal.sql`](../../supabase/migrations/20260518_google_calendar_personal.sql)
переписала RLS:

- `calendars_select_workspace` → `calendars_select_owner` (SELECT
  только `owner_user_id = auth.uid()` или is_workspace_owner).
- `external_calendar_events_select` → `external_calendar_events_select_owner`
  (JOIN через `calendars.owner_user_id`).

После этого календари остаются workspace-scoped (FK на workspaces, при
выходе участника удаляются), но visibility сужена.

## Главное 2: write-back в Google

### `google-calendar-write` (новая edge function)

Поддерживает три action: `create`, `update`, `delete`. Auth: JWT
пользователя. Owner-check: `calendars.owner_user_id = auth.uid()`.
После успешной записи в Google зеркалирует результат в
`external_calendar_events` (upsert/delete) — UI обновляется
синхронно, без ожидания следующего sync-цикла.

### Drag/resize external events в BoardListCalendarView

- `draggableAccessor` / `resizableAccessor` теперь возвращают `true`
  для обоих типов (раньше блокировали external).
- `handleEventDrop` / `handleEventResize` различают `kind`:
  - `kind='task'` → `useUpdateThreadTime` (как было).
  - `kind='external'` → `useWriteExternalEvent` с action='update' и
    optimistic update в кэше React Query (блок едет мгновенно).
- Клик по external event теперь не открывает Google, а вызывает
  `ConvertExternalEventDialog` (см. Главное 4).

### Хук `useWriteExternalEvent`

В `useGoogleCalendar.ts`. Возвращает мутацию, вызывает
`google-calendar-write` через `supabase.functions.invoke`. На успех
инвалидирует `external-calendar-events` queryKey.

### Кнопка ручного sync в toolbar календарного режима

`makeCalendarToolbar(calendarIds, onSync, syncing)` — кастомный
toolbar поверх дефолтного RBC. Справа от группы видов добавлена
иконка 🔄, которая зовёт `useSyncCalendar` для каждого из выбранных
календарей-источников параллельно. Иконка крутится во время синка.

## Главное 3: зеркалирование задач сервиса → Google

### Модель

Per-user mirroring (см. обсуждение в чате — оценивали Per-list vs
Per-user vs «не делать вообще», остановились на Per-user one-way
с явным управлением «зеркалить или нет»).

Две новые таблицы (миграция
[`20260518_google_calendar_mirror_tasks.sql`](../../supabase/migrations/20260518_google_calendar_mirror_tasks.sql)):

- **`user_calendar_mirror_settings`** (workspace_id, user_id,
  target_calendar_id, enabled) — один селектор на сотрудника в WS.
  RLS: видишь только свои строки. UNIQUE (workspace_id, user_id).
- **`task_google_event_map`** (thread_id, user_id, calendar_id,
  google_event_id) — маппинг задача ↔ Google-событие, **per-user**.
  Один тред у разных юзеров может иметь разные google_event_id
  (своя копия у каждого с включённым mirror). RLS: SELECT по
  собственным строкам (нужен фронту для скрытия дублей — см. ниже),
  write — только service_role.

### Trigger + edge function

[`20260518_google_calendar_mirror_trigger.sql`](../../supabase/migrations/20260518_google_calendar_mirror_trigger.sql)
вешает `notify_google_calendar_mirror()` на:

- `project_threads` AFTER INSERT/UPDATE OF (name, description,
  start_at, end_at, is_deleted, owner_user_id) OR DELETE.
- `project_thread_members` AFTER INSERT OR DELETE.

Trigger function через `net.http_post` шлёт `{thread_id}` в
`google-calendar-mirror-task` (verify_jwt=false, x-internal-secret).

**Edge function логика:**

1. Загружает тред (всё нужное в одном select).
2. Собирает «релевантных» юзеров: `created_by` ∪ `owner_user_id` ∪
   `project_thread_members.participant_id → participants.user_id`.
3. Для каждого юзера читает текущий маппинг и
   `user_calendar_mirror_settings`.
4. Decision tree:
   - `existing.calendar_id || target_calendar_id` → `effectiveCalId`.
     **Если есть существующий маппинг — работаем именно с тем
     календарём, mirror_target не перевешивает.** Это ключевое
     решение после регрессии: без этого convert «перетаскивал»
     событие в target.
   - Если `effectiveCalId` нет (юзер не настроил mirror и нет
     существующей привязки) → skip.
   - Если `is_deleted` или `start_at/end_at = NULL` → DELETE из
     Google + delete from external_calendar_events + delete map row.
   - Иначе → PATCH (если есть `existing`) или POST (новое), upsert
     `task_google_event_map`. На 404/410 при PATCH — fallback на POST.
5. `extendedProperties.private.clientcase_thread_id` записывается в
   событие — задел на защиту от циклов в будущем.

### UI селектор

В `GoogleCalendarSection.tsx` под списком календарей воркспейса:
выпадающий список «Зеркалить мои задачи в Google Calendar» с
вариантами «Выключено» + все Google-календари юзера. При смене
вызывается `useUpdateUserCalendarMirror` (upsert или delete row).

## Главное 4: convert event → task

### Контекст

Решали что делать с разделением сущностей «событие Google» vs «задача
сервиса». Унификация (`event = task` всегда автоматом) была отвергнута
— см. чат: события Google часто личные (стрижка, ДР, recurring), а
задача обязана быть в проекте, иметь исполнителя и т.п. Утечка
приватности + смешение моделей.

Выбран явный жест: клик по событию Google → диалог «Превратить в
задачу» → пользователь выбирает проект (опц.) → создаётся
`project_thread` (type='task') с теми же датами + строка в
`task_google_event_map` → дальше работает как обычная задача со
всеми features (исполнители, статус, комментарии). Drag/resize
такой задачи в сервисе обновляет привязанное Google-событие через
mirror.

### Компонент `ConvertExternalEventDialog`

Поля: название (prefill из event.title), проект (опц., default «Без
проекта» — задача попадает в orphan tasks). При сабмите зовёт RPC
`convert_external_event_to_task`.

### RPC `convert_external_event_to_task`

Миграция
[`20260518_convert_external_event_rpc.sql`](../../supabase/migrations/20260518_convert_external_event_rpc.sql).

**Зачем RPC** — race condition. Если делать два отдельных INSERT
(thread, потом map) с фронта:

1. INSERT в `project_threads` фиксирует строку → triggger AFTER
   INSERT срабатывает → шлёт http_post в mirror функцию.
2. Edge function успевает выполниться и НЕ находит маппинга (фронт
   ещё не успел вставить вторую строку).
3. Mirror использует `target_calendar_id` из mirror_settings →
   POST event в target → upsert map.
4. Фронт делает INSERT в `task_google_event_map` — упс, уже UPSERT
   PK конфликт, либо переписываем то что mirror создал.

Результат: дубликат в Google + map указывает не на исходное
событие, а на копию в target_calendar. Видели в тестах.

**Фикс:** RPC оборачивает всё в одну транзакцию + использует
`set_config('clientcase.skip_mirror', 'on', true)` — триггер проверяет
этот guard и пропускает обработку. После обоих INSERT'ов RPC сам
вызывает mirror функцию через `net.http_post` (state уже валидный,
mirror видит existing map и идёт по ветке PATCH source event).

### Скрытие дублей на фронте

После convert в `external_calendar_events` остаётся row про то же
самое событие — оно ещё живёт в Google и продолжает синкаться. Чтобы
не показывать его рядом с уже-созданной задачей,
`BoardListCalendarView` в queryFn `externalEvents` дополнительно
запрашивает `task_google_event_map` для текущих calendarIds и
фильтрует pair `(calendar_id, external_id)` через Set. SELECT-policy
`task_event_map_select_own` даёт фронту читать свои записи маппинга.

## Изменения вне основного скоупа

- **Scope `calendar.readonly` → `calendar`** в
  `google-calendar-auth/index.ts`. После этой смены существующим
  пользователям нужно нажать «Переподключить», чтобы запросить новые
  права на запись.
- **Хук `useUserCalendarMirror`** и `useUpdateUserCalendarMirror` в
  `useGoogleCalendar.ts` для управления настройкой зеркалирования с
  фронта.

## Известные ограничения / задачи на будущее

- **Recurring events.** Convert привязывается к конкретной инстанции
  (`<base>_<rfc3339>`). Если в Google поправят весь series — наша
  задача может рассинхрониться. Для MVP терпимо.
- **`extendedProperties.private.clientcase_thread_id`** записывается,
  но **не используется** для защиты от циклов на стороне sync. Если в
  будущем добавится двусторонняя синхронизация (Google → service),
  это поле нужно будет читать в sync и пропускать события с
  заполненным маркером (это «наши» обратно отзеркаленные).
- **All-day events** (date вместо dateTime в Google) пока работают
  только на чтение — convert/mirror пока поддерживают только
  dateTime.
- **Attendees из Google → исполнители задачи** не маппятся. Это
  отдельный долгий вопрос (email → participant.user_id, что если
  attendee внешний и т.п.).
- **Цикловая защита mirror trigger при convert.** Сейчас используется
  `current_setting('clientcase.skip_mirror', true) = 'on'` через
  `set_config(..., local := true)`. Это работает только потому, что
  RPC и trigger вызываются в одной транзакции. Если изменим
  архитектуру (отделим RPC от триггера) — надо переделать guard.
