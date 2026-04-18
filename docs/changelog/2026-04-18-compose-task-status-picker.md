# Смена статуса задачи из окна ввода сообщения

**Дата:** 2026-04-18
**Тип:** feat
**Статус:** completed

---

## Контекст

В Планфиксе в окне чата задачи есть удобная штука: при отправке сообщения можно одновременно сменить статус задачи. Одно действие — и ответ ушёл, и задача перешла в нужное состояние. У нас пользователь делал это в два шага: написать сообщение и отдельно переключить статус на доске/в списке задач.

## Решение

Новый бейдж-пилюля [TaskStatusPicker.tsx](../../src/components/messenger/TaskStatusPicker.tsx) — в панели инструментов композера справа от иконок редактора текста. Появляется только в тредах типа `task`; в чатах/email не рендерится.

### Логика

Локальный `pendingStatusId` в [MessageInput.tsx](../../src/components/messenger/MessageInput.tsx), сохраняется в `localStorage` по ключу `cc:pending-status:<threadId>` — если выбрать статус, но не отправить, выбор не сбрасывается (по явному запросу: «не надо сбрасывать»). Если кто-то поменял статус отдельно, и он совпал с запланированным — pending чистится автоматически.

В `handleSend`: если `pendingStatusId !== threadStatusId` — сначала апдейт `project_threads.status_id` через `useUpdateTaskStatus` (с audit-логом `change_status`), **потом** отправка сообщения. Если смена статуса упала (сеть и т.п.) — сообщение не уходит, чтобы не было рассинхрона.

Статус-чейндж в ленте остаётся отображаться **системной строкой** между сообщениями (старый путь через audit-события в `MessageList.tsx`). Вариант с бейджем внутри самого бабла обсуждали — решили не усложнять (отдельная миграция + раздвоение логики логирования).

### Визуал бейджа

Два состояния подобраны так, чтобы не путаться при «приглушённых» цветах вроде «Завершено» (серый):

- **Не меняется** — пунктирный контур `border-muted-foreground/20`, текст `text-muted-foreground/50`, иконка `text-muted-foreground/40`, без фона. Цвет самого статуса игнорируется, чтобы бледные статусы не терялись.
- **Выбран новый** — сплошной контур 0.5px в цвете статуса, лёгкий фон `color-mix(... 8%, transparent)`, **чёрный текст**, иконка в цвете статуса.

Форма — round-full (pill), высота 28px.

### Права

Не гейтим — консистентно с `TaskListView` и `BoardTabContent`, где смена статуса тоже не ограничена правами. Отдельного `tasks.change_status` в проекте нет; если когда-нибудь понадобится — закрывать нужно глобально, а не только в композере.

### Побочное изменение

[MinimalTiptapEditor.tsx](../../src/components/messenger/MinimalTiptapEditor.tsx) — кнопки редактора текста чуть ужаты (`min-w-7 px-1`, `gap-0`), чтобы освободить место под бейдж статуса справа. В `MessageInputToolbar.tsx` разделители между группами кнопок тоже подужались.

## Файлы

- `src/components/messenger/TaskStatusPicker.tsx` (new) — компонент бейджа + popover
- `src/components/messenger/MessageInput.tsx` — `pendingStatusId` + localStorage, интеграция в `handleSend`
- `src/components/messenger/MessageInputToolbar.tsx` — слот для пикера справа от toolbar редактора
- `src/components/messenger/MessengerTabContent.tsx` — прокидывает `threadType` и `threadStatusId` из `useProjectThreads`
- `src/components/messenger/MinimalTiptapEditor.tsx` — ужатые кнопки форматирования
