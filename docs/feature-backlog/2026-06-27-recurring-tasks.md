# Повторяющиеся задачи — ТЗ (MVP, Фаза 1)

Дата: 2026-06-27. Статус: **Фаза 1 реализована** (БД в проде, фронт ждёт деплоя). Git не пушен.

## ✅ Что реализовано (2026-06-27) — и отклонение от плана

**Отклонение (осознанное):** генерация сделана НЕ через edge-функцию, а **в plpgsql**, крон
зовёт SQL-функцию напрямую (как `dispatch_scheduled_messages`). Это убрало edge-функцию,
секрет и npm-зависимость `rrule` с бэкенда. Расписание хранится **структурно**
(`freq`/`byweekday`/`bymonthday`), а не строкой RRULE — для MVP-набора (день / дни недели /
число месяца / последний день) этого достаточно, и «следующая дата» считается в БД.
Полный RRULE + edge — Фаза 2, когда понадобятся сложные правила. **Крон — каждые 10 минут**
(`*/10 * * * *`), `fire_time` кратно 10 мин в UI.

**Модель времени (уточнена 2026-06-27):** дата повтора = дедлайн задачи. `fire_time` — время
задачи на каждую дату (дедлайн или начало интервала). `end_time` (опц.) → задача-интервал
`start_at`/`end_at` (попадает в календарь), дедлайн = конец. `create_lead_minutes` (дни+часы в UI)
= за сколько ДО времени задачи её создать. Отдельного «срок через N дней» нет —
заменён выбором конкретного времени/диапазона (как в поповере дедлайна). Колонка
`deadline_offset_minutes` удалена; миграции `..._offsets_minutes.sql` и `..._due_time_range.sql`.

Реализовано и проверено:
- Миграция `20260627_recurring_tasks.sql` (в проде): таблица `recurring_task_rules`, колонка
  `project_threads.recurring_rule_id`, RLS (по образцу `item_lists`), `recurring_next_occurrence()`
  (расчёт даты + кламп 31→посл.день + DST), триггер авто-`next_occurrence_at`,
  `generate_recurring_tasks()` (SECURITY DEFINER), pg_cron `generate-recurring-tasks`.
- Типы: `recurring_task_rules` + колонка добавлены в `src/types/database.ts` вручную.
- Фронт: `recurringKeys`, `useRecurringRules` (CRUD), `lib/recurring/schedule.ts` (превью + описание,
  13 тестов), диалог `RecurringRuleDialog`, страница `RecurringTasksPage` + роут `/recurring`,
  пункт «Сделать повторяющейся» в `TaskActionsMenu` (подключён в шапке задачи), пункт сайдбара.
- Проверки: tsc 0 (в новых файлах), lint 0, **752 теста** зелёные. Живой прогон генератора на
  тестовом правиле: задача создана (подстановка `{date}`, срок +N, исполнитель, привязка к правилу),
  правило сдвинулось на следующую дату; тестовые данные удалены.
- **Ждёт:** деплой фронта (push/CI) + визуальный смок. Реальная генерация уже идёт по крону
  каждые 10 мин (на пустой таблице — no-op).

---

## Исходный план (для истории; местами заменён реализацией выше)

Дата: 2026-06-27. Статус: план, код не начат.

## Цель

Дать возможность настроить, чтобы задача (`project_threads type='task'`) автоматически
пересоздавалась по расписанию (ежедневно / по дням недели / по числу месяца), с отдельно
задаваемыми **моментом создания** и **сроком** будущей задачи.

Модель — «правило повторения как отдельная сущность» (как в Планфиксе, но расписание по
стандарту iCal RRULE + генерация через наш pg_cron). Повторение держим **плоским**: одно
правило → одна задача. Вложенные «деревья повторений» (footgun Планфикса) — не делаем.

## Принятые продуктовые решения

1. **UI:** кнопка «Сделать повторяющейся» на задаче (копирует её поля в правило) + отдельная
   страница управления всеми правилами.
2. **Незакрытая предыдущая копия:** новая создаётся всё равно (как в Планфиксе). Опция
   «не создавать, пока предыдущая открыта» — отложена в Фазу 2.
3. **Точность:** почасовой крон-проход.
4. **Часовой пояс:** в MVP фиксированный `Europe/Madrid` (как у дневника). Per-rule TZ — Фаза 2.

## Что НЕ входит в MVP (явно)

- Сложные интервалы (`каждые 2 недели`, `каждый 2-й вторник`), лимит «по числу повторений».
- Календарная длительность (`start_at/end_at` через `duration_minutes`).
- Опция «не плодить, пока предыдущая открыта».
- Семантика редактирования «эта / все будущие», история созданных копий отдельным списком.
- Per-rule часовой пояс.
- Создание правила из `thread_templates` (в MVP правило самодостаточно; `source_template_id`
  хранится только как «откуда взяли», без live-связи).

---

## Блок A. База данных

### A1. Таблица `recurring_task_rules`

Поля:

**Идентификация / владение**
- `id uuid pk default gen_random_uuid()`
- `workspace_id uuid not null`
- `project_id uuid null` — NULL = личная задача
- `created_by uuid` — кто создал правило
- `owner_user_id uuid null` — владелец (для личных задач без проекта)

**Содержимое создаваемой задачи** (снимок, не live-ссылка)
- `title text not null` — шаблон имени, поддержка подстановок `{date}`, `{project_name}`
- `description text null`
- `accent_color text not null default 'blue'`
- `icon text not null default 'message-square'`
- `status_id uuid null` — стартовый статус создаваемой задачи
- `access_type text not null default 'all'`
- `access_roles text[] null`
- `assignee_participant_ids uuid[] not null default '{}'` — исполнители (→ `task_assignees`)
- `member_participant_ids uuid[] not null default '{}'` — для `access_type='custom'` (→ `project_thread_members`)
- `initial_message_html text null` — стартовое сообщение в треде (как у шаблона)
- `source_template_id uuid null` — provenance, без каскадов/связи

**Расписание**
- `rrule text not null` — например `FREQ=WEEKLY;BYDAY=MO`
- `timezone text not null default 'Europe/Madrid'`
- `fire_time time not null default '09:00'` — время суток «срабатывания»

**Тайминги создаваемой задачи**
- `create_lead_days int not null default 0` — за сколько дней ДО даты создавать задачу
- `deadline_offset_days int null` — срок = дата срабатывания + N дней (NULL = без срока)

**Пределы / состояние**
- `starts_on date null` — не раньше этой даты
- `until_date date null` — не позже
- `is_active boolean not null default true`
- `occurrences_count int not null default 0` — сколько раз уже создано
- `next_occurrence_at timestamptz null` — следующая «дата задачи» по RRULE (UTC); это поле
  крон и проверяет. Считается edge-функцией при создании/правке и после каждой генерации.
- `last_run_at timestamptz null`
- `last_generated_thread_id uuid null`

**Soft-delete (как у `project_threads`)**
- `is_deleted boolean not null default false`, `deleted_at timestamptz null`, `deleted_by uuid null`
- `created_at`, `updated_at` (триггер обновления `updated_at`)

Индексы:
- `idx_recurring_due` partial: `(next_occurrence_at) WHERE is_active AND NOT is_deleted` — для крон-выборки «кто пора».
- `idx_recurring_workspace`: `(workspace_id) WHERE NOT is_deleted`.

### A2. Колонка в `project_threads`
- `recurring_rule_id uuid null` — у сгенерированной задачи ссылка на правило (значок
  «повторяющаяся» + переход к правилу). Индекс не обязателен (низкая кардинальность запросов).

### A3. RLS на `recurring_task_rules`
По образцу существующих таблиц воркспейса:
- **SELECT:** участник воркспейса (для личных правил — только `owner_user_id`/`created_by` + менеджеры).
- **INSERT/UPDATE/DELETE:** `created_by`/`owner_user_id` ИЛИ менеджер с `manage_workspace_settings`.
- **service_role** — полный доступ (для генератора).
- Учесть триггер `prevent_impersonation_writes` (импersonация read-only) — он и так покроет таблицу.

### A4. Регенерация типов
После миграции: `supabase gen types typescript ... > src/types/database.ts`.
Если правка тел RPC/функций пойдёт через MCP (drift repo↔prod) — дополнить `database.ts` вручную.

---

## Блок B. Движок генерации

### B1. Edge Function `generate-recurring-tasks`
- Деплой `--no-verify-jwt`. Авторизация: `x-internal-secret` = `INTERNAL_FUNCTION_SECRET`
  (как у внутренних функций). Доступ к БД — service_role.
- Алгоритм:
  1. Выбрать правила: `is_active AND NOT is_deleted AND next_occurrence_at IS NOT NULL
     AND now() >= (next_occurrence_at - create_lead_days)
     AND (starts_on IS NULL OR next_occurrence_at::date >= starts_on)`.
  2. Для каждого правила (в транзакции на правило):
     - Подставить `{date}` (= `next_occurrence_at` в TZ правила), `{project_name}`.
     - INSERT `project_threads`: `type='task'`, `workspace_id`, `project_id`, `name`, `description`,
       `status_id`, `accent_color`, `icon`, `access_type`, `access_roles`, `created_by`,
       `owner_user_id`, `source_template_id`, `recurring_rule_id = rule.id`,
       `deadline = next_occurrence_at + deadline_offset_days` (если задан), `sort_order` (max+10).
     - INSERT строки `task_assignees` по `assignee_participant_ids`.
     - INSERT `project_thread_members` по `member_participant_ids` (если `access_type='custom'`).
     - `occurrences_count += 1`, `last_run_at=now()`, `last_generated_thread_id=<new>`.
     - Вычислить следующую дату: `next = rrule.after(next_occurrence_at)` через `rrule.js`
       (npm), с учётом TZ/DST. Если `next > until_date` или правило исчерпано → `is_active=false`
       (Планфикс-стиль: можно дополнительно soft-delete в «корзину»), иначе `next_occurrence_at=next`.
  3. **Catch-up:** если пропущено несколько дат (сервер лежал) — создаём ОДНУ текущую,
     дальше прыгаем на ближайшую будущую (не заваливаем пачкой). В лог — число пропущенных.
- Идемпотентность: после успешной генерации `next_occurrence_at` всегда сдвинут вперёд, повтор
  прохода в тот же час задачу не задвоит. Доп. страховка не требуется, но можно UNIQUE-маркер
  `(recurring_rule_id, next_occurrence_at)` на `project_threads`, если будут опасения по гонкам.

### B2. Расчёт `next_occurrence_at` при создании/правке правила
- На фронте при сохранении правила считаем первую `next_occurrence_at` через `rrule.js`
  (с учётом `fire_time`, TZ, `starts_on`) и пишем в строку — чтобы крон сразу знал «когда».
- Альтернатива: edge-функция `recurring-rule-preview` пересчитывает по запросу. Для MVP — фронт.

### B3. pg_cron
- Джоб `generate-recurring-tasks`, расписание `5 * * * *` (раз в час).
- Вызов через `net.http_post` на edge-функцию с `Authorization: Bearer <service key>` +
  `x-internal-secret` (паттерн `gmail-watch-refresh`).
- ⚠️ Ключ service_role **хардкодится в команду крона** (формат `sb_secret_...`, не legacy JWT) —
  см. `gotchas.md` → «pg_cron + service_role_key». При ротации ключа обновить команду.

---

## Блок C. Фронт

### C1. Библиотека
- `rrule` (npm) — собрать RRULE из контролов UI, показать «ближайшие 3 даты», человекочитаемый текст.

### C2. Хуки и ключи
- `src/hooks/useRecurringRules.ts` — CRUD (`useRecurringRules`, `useCreateRecurringRule`,
  `useUpdateRecurringRule`, `useToggleRecurringRule`, `useDeleteRecurringRule`).
- `src/hooks/queryKeys/recurring.ts` — `recurringKeys.byWorkspace(ws)`, `.byId(id)`,
  `.byProject(projectId)`. Добавить в barrel `index.ts`.
- Инвалидация: после CRUD — `recurringKeys.*`. Генерация задач крон-ом обновит списки через
  существующий realtime/инвалидацию задач при следующем рефетче (новый тред = обычная задача).

### C3. Диалог настройки повторения
Поля UI (маппятся в правило):
- Периодичность: Ежедневно / По дням недели (чекбоксы Пн–Вс) / Ежемесячно по числу
  (+ «последний день месяца»). Это покрывает MVP-набор RRULE.
- Время суток (`fire_time`).
- Создавать за N дней до даты (`create_lead_days`, по умолч. 0).
- Срок задачи: «через N дней после создания» (`deadline_offset_days`) или «без срока».
- Действует до (`until_date`, опционально), с (`starts_on`, опционально).
- Блок превью: «Ближайшие даты создания: …» (rrule.js).
- Исполнители, статус, оформление — подтягиваются с задачи (при «сделать повторяющейся») либо
  выбираются вручную (на странице управления).

### C4. Точки входа
- **Кнопка «Сделать повторяющейся»** на задаче (в шапке панели / меню задачи) — открывает диалог,
  префилл из текущей задачи (`title`, `project_id`, `status_id`, исполнители, оформление, access).
- **Значок на задаче**, если `recurring_rule_id` задан, со ссылкой на правило.
- **Страница управления** `/workspaces/[id]/recurring` (или раздел в «Задачах») — таблица правил:
  название, периодичность (человекочит.), следующая дата, активно/выкл, кол-во созданных,
  действия (правка / вкл-выкл / удалить). По образцу `ItemListsPage`.

### C5. Сайдбар (опционально)
- Слот в настройках сайдбара на страницу «Повторяющиеся» (как доски/списки) — Фаза 2.

---

## Блок D. Тесты

- Чистые функции: маппинг UI↔RRULE, подстановка `{date}`/`{project_name}`, расчёт `deadline`.
- `next_occurrence_at`: после генерации сдвигается; `until_date`/исчерпание → `is_active=false`.
- Catch-up: при пропуске создаётся одна, next прыгает в будущее.
- RLS: участник видит правила воркспейса; чужое личное — нет.
- `npm run lint && npm test` зелёные.

---

## Блок E. Деплой / чеклист сдачи

- [ ] Миграция `recurring_task_rules` + колонка `project_threads.recurring_rule_id` + RLS.
- [ ] `supabase gen types ... > src/types/database.ts`.
- [ ] Edge `generate-recurring-tasks` задеплоена **с `--no-verify-jwt`**.
- [ ] pg_cron `generate-recurring-tasks` `5 * * * *`, service-key хардкод (gotchas).
- [ ] Хуки + queryKeys + barrel.
- [ ] Диалог + кнопка на задаче + страница управления.
- [ ] `npm run lint && npm test` зелёные.
- [ ] Смок: создать правило «ежедневно, срок +1 день» → дождаться часового прохода (или дёрнуть
      edge вручную) → задача появилась с корректными сроком/исполнителями/статусом;
      выключить правило → новые не создаются; `until_date` в прошлом → правило само деактивируется.
- [ ] Не пушить без явного «да».

---

## Фаза 2+ (бэклог)

- Опция «не создавать, пока предыдущая открыта».
- Календарная длительность (`duration_minutes` → `start_at/end_at`).
- Per-rule часовой пояс.
- Сложные RRULE (интервалы, `каждый 2-й вторник`, `COUNT`).
- Семантика редактирования «эта / все будущие», список созданных копий.
- Создание правила из `thread_templates`.
- Слот «Повторяющиеся» в сайдбаре.
