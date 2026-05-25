# Session fixes — панель, цвета календарей, тосты тредов, KB-индексация, tiptap

**Дата:** 2026-05-25
**Тип:** bugfix + feature
**Статус:** completed

---

## Контекст

Сессия из шести самостоятельных правок по разным зонам. Каждая возникла из
живого репорта пользователя — соответственно, чинились по одной по ходу
диалога.

---

## 1. Standalone-режим панели не сбрасывался при переходе на проект

**Симптом:** в боковой панели открыт личный диалог (TG Business / Wazzup /
Email — тред с `project_id = NULL`). Пользователь кликает по проекту в
сайдбаре — панель **остаётся** с тем же личным диалогом, вкладки проекта
не подгружаются.

**Причина:** в [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx)
синк `pageProjectId → activeProjectId` (render-time pattern) обновлял
только scope, но **не сбрасывал `standaloneThread`**. А в рендере
`effectiveTabs = inStandalone ? standaloneTabs.tabs : tabs.tabs` —
пока `standaloneThread != null`, рисуются in-memory standalone-вкладки
вместо подгруженных вкладок проекта.

**Фикс:** в том же блоке синка при смене `pageProjectId` дополнительно:
сбрасываем `standaloneThread`, ресетим `standaloneTabs`, выключаем
`knowledgeMode`. Объявление `standaloneTabs` перенесено выше блока
синка (он его теперь использует).

---

## 2. Выбор цвета для Google-календарей

**Симптом:** в IntegrationsTab у добавленного Google-календаря — статичный
кружок цвета (цвет приходит из Google при добавлении). Поменять цвет в
сервисе нельзя — статичный.

**Фикс:**

- Хук [`useUpdateCalendarColor`](../../src/hooks/useGoogleCalendar.ts)
  (UPDATE `calendars.color` + инвалидация `googleCalendarKeys.calendars(ws)`
  и `externalCalendarKeys.all` — цвет обновляется в сетке досок без
  перезагрузки).
- UI: кружок цвета у Google-календаря в
  [`GoogleCalendarSection.tsx`](../../src/page-components/workspace-settings/IntegrationsTab/GoogleCalendarSection.tsx)
  стал кликабельным. Попап с палитрой из **10 акцентных цветов сервиса**
  (`ACCENT_HEX`) — единый визуальный язык с задачами и тредами.

Дизайн-выбор по согласованию с пользователем (3 опции были: акценты
сервиса / палитра Google / свободный HEX picker).

---

## 3. Снятие тоста при завершении треда

**Симптом:** висит тост о новом сообщении в треде. Юзер открывает тред
не через тост (через сайдбар) и завершает (выставляет финальный статус) —
тост остаётся висеть до таймаута.

**Причина:** дyx путей пометить тред прочитанным:

1. Из UI чата → `applyOptimisticMarkRead` → вызывает `dismissProjectToasts`.
2. При смене статуса на финальный → `useMarkThreadReadIfFinal` → дёргает
   `markAsRead` напрямую, минуя `applyOptimisticMarkRead`. **Один шаг
   забыли — dismiss тостов.**

**Фикс:**

- Новая утилита `dismissThreadToasts(threadId)` в
  [`useMessageToastPayload.ts`](../../src/hooks/messenger/useMessageToastPayload.ts) —
  фильтр по суффиксу `:threadId` в `groupKey`. Работает и для проектных
  тредов, и для личных диалогов (project_id=NULL) — там
  `dismissProjectToasts` не сработала бы.
- В [`useMarkThreadReadIfFinal.ts`](../../src/hooks/messenger/useMarkThreadReadIfFinal.ts)
  после `markAsRead` вызываем `dismissThreadToasts(threadId)`.

Эффект: завершение треда из любой точки (карточка задачи, настройки чата,
пакетные операции в списках, боковая панель) гасит висящий тост по этому
треду. Тосты других тредов не трогаем.

---

## 4. Прошедшие события календаря — осветление вместо прозрачности

**Симптом:** прошедшие события в сетке календаря на досках были полупрозрачные
(`opacity: 0.55`). На пёстром фоне сетки белый текст становился плохо
читаемым — opacity роняет прозрачность и фону, и тексту.

**Фикс:** в [`BoardListCalendarView.tsx`](../../src/components/boards/BoardListCalendarView.tsx)
заменили `opacity: 0.55` на `color-mix(in srgb, <bg> 65%, white)` для
isPast-событий. Только фон осветляется (35% белого подмешано в оригинал),
текст остаётся полноценно белым.

Поддержка `color-mix`: Chrome 111+, Safari 16.2+, Firefox 113+ (2023+) —
все актуальные браузеры.

---

## 5. Knowledge-индексация падала с непонятной ошибкой

**Симптом:** при попытке проиндексировать статью базы знаний —
`POST /functions/v1/knowledge-index 500` и тост «Не удалось запустить
индексацию». В БД статье ставился `indexing_error = "Ошибка индексации.
Попробуйте позже."` — диагностически бесполезно.

**Диагностический шаг (правка edge function):** заменили генерик-сообщение
на реальное `err.message` в трёх местах
[`knowledge-index/index.ts`](../../supabase/functions/knowledge-index/index.ts) —
catch на single article (стр. 449), catch внутри batch reindex articles
(стр. 261) и Q&A (стр. 308). Response теперь возвращает `details` и
`stack`. Деплой через `supabase functions deploy`.

После повторного запуска юзером в БД появилось:
```
Failed to upsert embeddings: type "vector" does not exist
```

**Корневая причина:** функции `upsert_knowledge_embeddings` и
`match_knowledge_chunks` имели `proconfig = ["search_path=public"]`.
Тип `vector` (pgvector) живёт в схеме `extensions` — функция его не
видела при касте JSON → vector.

**Фикс корневой причины:** миграция
[`20260525_fix_knowledge_functions_search_path_vector.sql`](../../supabase/migrations/20260525_fix_knowledge_functions_search_path_vector.sql) —
`ALTER FUNCTION ... SET search_path = public, extensions` обеим функциям.
Применено к продовой БД через MCP и зафиксировано в репо как миграция.

Скорее всего проблема пришла с автогенерируемой миграцией после security
review, которая выставила `SET search_path = public` всем функциям,
не учитывая что некоторые работают с типами из `extensions`. Стоит
пройтись по остальным функциям из последних миграций с тем же риском.

---

## 6. Tiptap block-gap-inserter падал с «view is not available»

**Симптом:** runtime error в редакторе tiptap при движении мыши над
областью документа:
```
[tiptap error]: The editor view is not available. Cannot access view['dom'].
The editor may not be mounted yet.
```
Стек указывал на [`block-gap-inserter.tsx:110`](../../src/components/tiptap-editor/block-gap-inserter.tsx:110).

**Причина:** `editor.view` — это getter Tiptap, который кидает эту ошибку
если `editor.isDestroyed`. В этом файле:

- `globalListener` для `document.mousemove` живёт глобально на module-level
  и сбрасывается только когда **все** gap-inserters размонтированы.
- `globalEditorRef.current` обновлялся на каждом рендере, но **никто не
  сбрасывал его при destroy editor'а**.

Сценарий: editor destroyed → ref всё ещё держит ссылку → mousemove →
`ed.view.dom` → краш.

**Фикс:** в обоих хендлерах (`onMouseMove` и `btn click`) перед
обращением к `ed.view` / `ed.state` / `ed.chain` проверяем
`ed.isDestroyed`. Если destroyed — сбрасываем ref в null + прячем gap.

---

## Затронутые файлы

- `src/components/tasks/TaskPanelTabbedShell.tsx`
- `src/hooks/useGoogleCalendar.ts`
- `src/page-components/workspace-settings/IntegrationsTab/GoogleCalendarSection.tsx`
- `src/hooks/messenger/useMessageToastPayload.ts`
- `src/hooks/messenger/useMarkThreadReadIfFinal.ts`
- `src/components/boards/BoardListCalendarView.tsx`
- `src/components/tiptap-editor/block-gap-inserter.tsx`
- `supabase/functions/knowledge-index/index.ts` (+ деплой)
- `supabase/migrations/20260525_fix_knowledge_functions_search_path_vector.sql` (+ apply)

## Проверки

- `npx tsc --noEmit` — зелёный после каждой правки
- `vitest run src/store/sidePanelStore.test.ts` — 50/50 (по правке #1)
- Preview-проверка color picker'а (правка #2) и осветления фона (правка #4)
  через `mcp__Claude_Preview` — corner cases подтверждены
