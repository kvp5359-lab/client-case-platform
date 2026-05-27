# TaskPanelTabs — race condition: вкладки одного проекта писались в скоуп другого

**Дата:** 2026-05-27
**Тип:** bugfix (data corruption + UI)
**Статус:** completed

---

## Симптом

Юзер открыл проект A. В правой панели на вкладке «Задачи»
отображались задачи **другого проекта** B (которым только что
открывал). Тред в той же панели открыт правильный (из A) — баг
проявлялся только на системной вкладке «Задачи».

В URL `panelTab=tasks:<uuid>` стоял UUID проекта B, при том что
страница — проекта A.

## Расследование (БД-измерение)

В `task_panel_tabs` для (user=`kvp5359`, project_id=A) лежала
вкладка:

```json
{
  "id": "tasks:<UUID_B>",
  "type": "tasks",
  "refId": "<UUID_B>",
  "title": "Задачи",
  "pinned": true
}
```

`refId` указывает на проект B, а сама строка — в скоупе A.
`TasksTabContent` рендерится по `refId`, отсюда «чужие задачи».

**Масштаб у kvp5359 — 4 битые записи за неделю:**

| Когда | Скоуп | refId «Задач» указывает на |
|---|---|---|
| 27.05 17:11 | Юлия Шестак (64) | Владимир Коба (16) |
| 26.05 23:01 | Илья Низаев (58) | Aliaksandr Avizhych (80) |
| 25.05 15:35 | София Потапова (57) | Михаил Какузин (56) |
| 20.05 08:00 | Мария Попова (43) | София Потапова (57) |

У других пользователей — чисто. Это паттерн быстрого
переключения между проектами у одного человека.

## Корень

`useTaskPanelTabs.persist` (`src/components/tasks/useTaskPanelTabs.ts`)
сохраняет вкладки в БД через debounce 250 мс. Mutation
(`upsertMutation`) брала `scopeKind`/`scopeKey` из **closure хука**
на момент срабатывания таймера, не на момент вызова `persist`.

Сценарий race:

1. Юзер на проекте B, активный scope=B.
2. Что-то меняет вкладки → `persist(tabs, ...)` → setTimeout 250 мс.
3. В течение этих 250 мс юзер переходит на проект A.
4. Render → `useTaskPanelTabs` пересоздаёт mutation со scope=A,
   `upsertMutationRef.current` обновляется через useEffect.
5. Таймер срабатывает → mutation пишет **tabs из B** в строку
   **scope=A**. Так одна `tasks`-вкладка с `refId=B` оказывается
   в записи user×A.

Render-time reset на смене scope (строки 164-173) пытался
clearTimeout, но в части последовательностей не успевал —
либо таймер уже сработал, либо useEffect для `upsertMutationRef`
запускался раньше, чем render-time-reset с clearTimeout.

## Фикс

### 1. Backfill в БД

Прогнал SQL, который для каждой записи `task_panel_tabs` с
project scope нормализует `tasks`-вкладки: `refId := project_id`
скоупа, `id := 'tasks:' + project_id`. Если `active_tab_id`
начинался с `tasks:` — пересобран. **4 строки исправлены**, в
БД больше нет вкладок с чужими refId.

### 2. Код — race-guard в persist

Файл: [`useTaskPanelTabs.ts`](../../src/components/tasks/useTaskPanelTabs.ts)

- **Snapshot scope в payload.** `persist` теперь захватывает
  `scopeKey/scopeKind/userId` в локальные переменные на момент
  вызова и кладёт их в `persistPayloadRef.current` вместе с
  tabs. Mutation использует scope из payload, а не из closure.
- **Race-guard в setTimeout.** Через `scopeKeyRef` (обновляется
  useEffect'ом) сверяем `payload._scopeKey === scopeKeyRef.current`
  перед `mutate`. Не совпало — отбрасываем payload, не пишем.
- **Sanity-нормализация `sanitizeTabsForScope`.** На входе в
  persist прогоняем все вкладки: если есть `type=tasks` с
  `refId !== scopeKey`, переписываем `id` и `refId` на текущий
  scope и логируем `BUG.tasks_ref_mismatch`. Страховка на
  случай, если новый race пройдёт через ref-guard и/или в
  `localTabs` уже сидит битая запись.
- **Mutation сменила сигнатуру** на `PersistPayload` (внутренний
  тип): `tabs + active_tab_id + _scopeKind + _scopeKey + _userId`.
  `onSuccess` теперь пишет в `setQueryData` ключа от payload,
  не из closure — на случай, если scope успел смениться к
  моменту onSuccess.

## Затронутые файлы

- `src/components/tasks/useTaskPanelTabs.ts` — race-guard + sanitize
- Backfill (через MCP) — 4 строки в `task_panel_tabs`

## Проверки

- `npx eslint --max-warnings 0` — чисто.
- `npx tsc --noEmit` — чисто.
- `npm test` — 660/660 passed.
- В БД после backfill'а:
  `SELECT COUNT(*) FROM task_panel_tabs WHERE ... refId != project_id` = **0**.

## Что мониторить

- Если в prod-логах появится `BUG.tasks_ref_mismatch` — значит
  sanitize перехватил очередной случай. Race-guard должен такой
  кейс отбросить ДО mutation, поэтому появление этого лога
  означает: либо новый путь записи (где persist не используется),
  либо `localTabs` забился через какой-то ещё путь. Идти
  смотреть стек.
- Через неделю — повторить запрос «битые tasks-вкладки» по
  всем `task_panel_tabs`. Если ноль — race починен окончательно.
