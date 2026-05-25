# Inbox media preview + восстановление панели по URL + сохранение panelTab при RLS-redirect

**Дата:** 2026-05-25
**Тип:** feature + bugfix
**Статус:** completed

---

## Контекст

Три связанные проблемы вокруг тредов во «Входящих» и shareable-ссылок:

1. **Аудио и медиа в инбоксе показывались пустотой.** Если последнее сообщение
   треда — голосовое / картинка / видео без подписи, в списке inbox-строки
   видно только «Имя:» с пустым превью после двоеточия. Race condition
   между INSERT в `project_messages` и INSERT в `message_attachments`
   усугублял: на момент рендера у нас был `content='📎'`, но
   `last_message_attachment_name` ещё null. Фронт-логика fallback-а не было.
2. **После reload боковая панель закрывалась — иногда.** На страницах без
   проекта (`/boards`, `/inbox`) ссылка с `?panelTab=thread:<id>` для
   тредов **без project_id** (личные диалоги TG Business / MTProto / Wazzup /
   личный email) панель не восстанавливала. Резолвер `useThreadFromPanelTab`
   возвращал `null` при `project_id IS NULL` — и `activeProjectId` оставался
   пуст, standalone-режим запускался только при ручном клике.
3. **Shareable-ссылка на тред терялась при RLS-редиректе.** Если получатель
   ссылки имел доступ к самому треду (через `access_type='custom'` +
   `project_thread_members`), но **не** к проекту, server-side guard в
   layout проекта редиректил на список проектов воркспейса — тред в
   `?panelTab=` пропадал тихо, без объяснений.

## Что сделано

### Stage 1 — Media preview во «Входящих»

Расширили RPC `get_inbox_threads_v2`: добавили колонку
`last_message_attachment_mime` (mime первого вложения last_message).
Миграция: [`20260525_inbox_v2_attachment_mime.sql`](../../supabase/migrations/20260525_inbox_v2_attachment_mime.sql).
Сигнатура функции изменилась — `CREATE OR REPLACE` не сработал бы из-за
изменения `RETURNS TABLE`, поэтому DROP + CREATE.

Тип [`InboxThreadEntry`](../../src/services/api/inboxService.ts) получил поле
`last_message_attachment_mime: string | null`. Регенерация `database.ts`
через `supabase gen types typescript`.

В [`InboxChatItem.tsx`](../../src/components/messenger/InboxChatItem.tsx) —
новый helper `getMediaPreview(mime, fileName)` и переписанная ветка
рендера превью:

- text есть и это не плейсхолдер → как раньше
- text пуст/плейсхолдер + есть media-сигнал (`name` или `mime` или
  `count > 0`) → «🎤 Голосовое сообщение» / «🎵 Аудио» / «🖼 Изображение» /
  «🎬 Видео» / «📎 имя файла»
- ничего нет → «Нет сообщений»

Покрывает race condition: даже если `last_message_attachment_name` ещё не
записан, плейсхолдер «📎» в content + mime из вложения дают осмысленный
текст.

### Stage 2 — Восстановление панели по URL для всех типов тредов

`useThreadFromPanelTab` теперь возвращает **все поля треда** (имя, тип,
projectId, contactParticipantId, icon, accentColor) — а не только
projectId. Тип переименован в экспортный `ResolvedThread`. Раньше при
`project_id IS NULL` функция возвращала `null` — теперь возвращает данные
треда.

В [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx)
восстанавливающий useEffect обрабатывает три случая:

- `projectId` есть → `setActiveProjectId` + `setPendingOpen({tab, projectId})`
- `contactParticipantId` есть → `setActiveContactId` + `setPendingOpen({tab, projectId: null})`
- ни того ни другого → `setStandaloneThread(...)` + `standaloneTabs.seed([tab], tab.id)`

`pendingOpen` обрабатывается существующим эффектом — после `tabs.isReady`
вызывает `tabs.openTab(threadTab)`. Это гарантирует, что вкладка треда
открывается даже если её нет в persisted `task_panel_tabs`.

Защищён `restoredFromUrlRef` — отрабатывает один раз, ручные действия
пользователя не перетираются. `userInteractedRef` (выставляется любым
ручным `openThreadTab` / `openSystemTab`) тоже блокирует повторный
запуск restore — гарантия от «дёргания» панели.

### Stage 3 — Server-side guard сохраняет panelTab при RLS-redirect

В Next 16 server-component layouts **не получают `searchParams`** (это
by design — layout кэшируется). Чтобы серверный гард мог принять
решение на основе query, middleware [`src/proxy.ts`](../../src/proxy.ts)
в `handleAuthAndRewrite` теперь пробрасывает в request headers `x-url`
с полным исходным URL пользователя.

В layout проекта [`[projectId]/layout.tsx`](../../src/app/(app)/workspaces/[workspaceId]/projects/[projectId]/layout.tsx)
перед `redirect(...)` из-за RLS на проект:

1. Читает `x-url` через `headers()` из `next/headers`.
2. Парсит `panelTab=thread:<short|uuid>` через хелпер
   `resolveThreadFromPanelTab` (RPC `resolve_short_id` или regex для UUID).
3. SELECT по `project_threads` под RLS текущего пользователя — RLS
   через `can_user_access_thread` сам разрулит per-thread доступ.
4. Если тред доступен → редирект на
   `/workspaces/<wsId>/inbox?panelTab=<panelTab>` —
   `TaskPanelTabbedShell` смонтирован в `WorkspaceLayout` и откроет
   панель на нейтральной странице.
5. Если тред недоступен или нет panelTab → стандартный редирект на
   список проектов воркспейса (как до правки).

## Ограничения / не покрыто

- **Доски** — per-board прав в модели сейчас нет (RLS `boards` пускает
  любого участника воркспейса). Если когда-нибудь появятся, такой же
  guard понадобится на board layout.
- **Toast «нет доступа к треду»** — если у получателя ссылки нет прав ни
  на проект, ни на тред, он молча попадает на список проектов и не
  понимает почему панель не открылась. Сейчас принято как known-issue.
- **Сценарий «нет прав на проект, есть на тред»** воспроизвести в
  одиночном пользовательском сеансе нельзя — нужно ручное тестирование
  под аккаунтом сотрудника с `access_type='custom'`.
