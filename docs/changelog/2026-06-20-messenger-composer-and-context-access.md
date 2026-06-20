# Композер мессенджера (@-упоминания, статус, видимость) + доступ к материалам команды

**Дата:** 2026-06-20
**Тип:** fix + UX + feature
**Статус:** completed (фронт ждёт деплоя CI; БД project-context уже в проде)

---

Сборный релиз за день: три независимых блока, закоммичены отдельными коммитами,
уезжают одним пушем.

## 1. Мессенджер — композер (карантин, точечные правки)

**Зона: карантин.** Правки строго под задачу, со смок-тестом в превью.

### @-упоминания: попап не закрывался

**Симптом:** список участников после `@` закрывался ровно один раз, потом не
закрывался ничем (крестик / клик мимо / Enter / Escape).

**Корень (найден замером в превью, не гаданием):** `render()` у Tiptap
suggestion вызывается **один раз** на плагин — переменные замыкания (`done`,
`inserted`, `selectedIds`, `container`...) общие для ВСЕХ открытий попапа.
`onStart` их не сбрасывал → после первого закрытия `done=true` оставался
навсегда → `cleanup()` любого следующего попапа упирался в `if (done) return`
и ничего не делал. Отсюда «закрылось один раз, потом никогда».

**Фиксы** (`messengerMention.ts`):
- сброс состояния сессии (`done/inserted/selectedIds`) в начале `onStart`;
- размонтаж попапа отложен в `setTimeout(0)` — синхронный `root.unmount()` из
  обработчика внутри того же React-рута React 19 глотает (крестик/«Упомянуть»
  не закрывали);
- самолечение: при открытии `@` сносятся осиротевшие `.cc-mention-popup`
  (HMR/гонки teardown оставляли «зомби»-контейнеры);
- Enter подтверждает «Упомянуть» из редактора (suggestion `onKeyDown` гасит
  Enter, чтобы ProseMirror не оставил «@»), плюс Enter в поле поиска попапа.

**UI попапа** (`MentionMultiSelectPopup.tsx`): крестик закрытия — кружком на
верхнем правом углу, меньше по размеру, анимация на hover (`scale`/подсветка).

### Кнопка статуса задачи — обратно в тулбар редактора

Pending-пикер статуса (Planfix-style) вернулся из плавающей строки в ряд
тулбара справа от форматирования (как было до выноса). Кнопка всегда
показывает текст **«Новый статус»** (реальный статус — точка/цвет слева +
tooltip).

- `MessageInputToolbar.tsx` — проп `taskStatusPicker` + рендер пикера.
- `MessageInput.tsx` — прокидывает данные (расширен тип `statusPending`:
  `taskStatuses`, `currentStatusId`, `handlePickStatus`).
- `TaskStatusPicker.tsx` — постоянный текст триггера.

### Строка над композером

- «Прочитано/Непрочитано» — **по центру** строки (абсолютное центрирование),
  переключатель видимости и `@` остаются слева.
- В тредах **без клиента** режим «Клиенту» скрыт, дефолт → «Команде». Признак
  «клиентский тред» = участник-«Клиент» с доступом ИЛИ TG-группа/Email ИЛИ
  личный диалог Business/Wazzup/MTProto (чтобы не сломать личные диалоги).

**Файлы:** [`messengerMention.ts`](../../src/components/messenger/messengerMention.ts),
[`MentionMultiSelectPopup.tsx`](../../src/components/messenger/MentionMultiSelectPopup.tsx),
[`ComposerVisibilitySwitch.tsx`](../../src/components/messenger/ComposerVisibilitySwitch.tsx),
[`TaskStatusPicker.tsx`](../../src/components/messenger/TaskStatusPicker.tsx),
[`MessageInputToolbar.tsx`](../../src/components/messenger/MessageInputToolbar.tsx),
[`MessageInput.tsx`](../../src/components/messenger/MessageInput.tsx),
[`MessengerTabContent.tsx`](../../src/components/messenger/MessengerTabContent.tsx).

## 2. Project Context — доступ к материалам команды «кто видит заметку»

Контекст проекта (внутренние материалы команды) получил per-item управление
доступом, по аналогии с доступом к задачам/чатам.

- **Per-item доступ:** `access_type` (`roles`/`custom`) + `access_roles` +
  индивидуальные участники через новую таблицу `project_context_item_members`.
  Дефолт новой заметки — роли «Администратор + Исполнитель».
- Пикер доступа переиспользован из мессенджера: `ChatSettingsAccess` получил
  пропсы `label`/`hint` (подпись «Кто видит заметку» + своя подсказка).
- Блок «Материалы команды» переехал со **своей вкладки** на **верх вкладки
  «Задачи»** — модуль `project_context` теперь `showTab:false`.
- Сервис: `updateItemAccess(id, access)` (режим + роли + перезапись членов),
  `SELECT_WITH_FILE` тянет `members`. Хук `useUpdateContextAccess`.

**Файлы:** [`projectContextService.ts`](../../src/services/api/projectContext/projectContextService.ts),
[`useProjectContext.ts`](../../src/hooks/projects/useProjectContext.ts),
[`projectModuleRegistry.ts`](../../src/lib/projectModuleRegistry.ts),
[`ContextTextDialog.tsx`](../../src/page-components/ProjectPage/components/ContextTextDialog.tsx),
[`ProjectContextItemCard.tsx`](../../src/page-components/ProjectPage/components/ProjectContextItemCard.tsx),
[`ProjectContextTabContent.tsx`](../../src/page-components/ProjectPage/components/ProjectContextTabContent.tsx),
[`ProjectTabsContent.tsx`](../../src/page-components/ProjectPage/components/ProjectTabsContent.tsx),
[`ChatSettingsAccess.tsx`](../../src/components/messenger/ChatSettingsAccess.tsx),
[`types/database.ts`](../../src/types/database.ts).

## 3. Инбокс — иконка MTProto-тредов

`InboxChatItem.tsx` — алиас `send → Send` в `iconByThreadIcon`. MTProto-треды
иногда создаются с `icon='send'`, которого нет в реестре `THREAD_ICONS` → значок
падал в fallback (квадрат вместо самолётика).

## Миграции / Edge Functions

- **Project Context (блок 2):** колонки `access_type`/`access_roles` на
  `project_context_items` + таблица `project_context_item_members` (+RLS) —
  **уже в проде** (применялись через MCP, отдельного файла-миграции нет, drift
  репо↔прод). Деплой выкатывает только фронт; БД-зависимость в проде есть.
- Edge Functions не трогались.

## Известные ограничения

- Блок 2 (project-context access) реализован вне этой сессии; здесь только
  закоммичен. Полный аудит RLS «кто видит заметку» не проводился.
- Композер мессенджера — карантин: живой смок-тест каналов (TG/Wazzup/Email)
  за пользователем; в превью проверено закрытие @-попапа (4 цикла) и сборка.
