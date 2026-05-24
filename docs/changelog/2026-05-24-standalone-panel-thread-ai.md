# Standalone-режим панели + thread-scope AI ассистент

**Дата:** 2026-05-24
**Тип:** feature + UX + refactor
**Статус:** completed

---

## Контекст

Боковая панель в личных диалогах сотрудника (TG Business, MTProto, Wazzup
личные — треды с `project_id IS NULL` и `contact_participant_id IS NULL`)
работала криво:

1. **Крестик закрытия пропадал.** Он жил в `TaskPanelTabBar`, а в
   standalone-режиме сам TabBar не рендерился — закрыть панель было нечем,
   кроме как открыть другой тред или нажать иконку в сайдбаре.
2. **TabBar отсутствовал.** Невозможно было открыть рядом с диалогом
   AI-ассистента, статью базы знаний или историю — это есть только в
   проектных тредах.
3. **AI-ассистент не знал про переписку.** Даже если открыть его как-то
   иначе, он работал только по базе знаний — в personal dialog нет
   `project_id`, а вся data-load инфраструктура AI завязана на проект.

## Что сделано

Унифицированная модель: всегда рендерим 3 строки боковой панели
(шапка scope + TabBar + контент активной вкладки), различается только
тип шапки и источник вкладок.

### Stage 1 — info-row для standalone

Новый компонент [`PanelStandaloneInfoRow`](../../src/components/tasks/PanelStandaloneInfoRow.tsx)
— шапка с именем треда (имя собеседника) и кнопкой `×` справа.
Стилистически идентична `PanelContactInfoRow` / `PanelProjectInfoRow`.

В [`TaskPanelTabbedShellRenderer.tsx`](../../src/components/tasks/TaskPanelTabbedShellRenderer.tsx)
выбор шапки: standalone → новая, иначе contact или project как было.

### Stage 2 — in-memory TabBar

Новый хук [`useStandaloneTabs`](../../src/components/tasks/useStandaloneTabs.ts)
— локальный state вкладок с API, совместимым с DB-backed `useTaskPanelTabs`
(`openTab`, `closeTab`, `activateTab`, `togglePin`, `reorderTab`, `seed`,
`reset`). НЕ персистится в БД — живёт только в сессии панели.

В [`TaskPanelTabbedShell.tsx`](../../src/components/tasks/TaskPanelTabbedShell.tsx)
развилка `inStandalone`: эффективные `tabs`/`activeTab`/handlers выбираются
из in-memory state или из DB-backed `useTaskPanelTabs`. При открытии
personal-dialog треда стандартно создаётся одна вкладка-тред; «+» в TabBar
позволяет добавить рядом ассистента, KB-статью, историю.

Закрытие primary thread-таба в standalone → выход из standalone +
скрытие панели. Закрытие ad-hoc вкладок — просто их удаление из in-memory
state.

Унификация рендера: убрана special-case ветка standalone в Renderer.
Теперь логика контента всегда одна: `activeTab.type → соответствующий рендер`.
Различается только тип шапки.

### Thread-scope AI ассистент (вариант c)

Полноценный ассистент, отвечающий на вопросы по конкретному треду
personal-dialog'a.

**Миграция БД** (применена через MCP):

```sql
ALTER TABLE knowledge_conversations
  ADD COLUMN IF NOT EXISTS thread_id UUID
  REFERENCES project_threads(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_knowledge_conversations_thread
  ON knowledge_conversations(thread_id)
  WHERE thread_id IS NOT NULL;
```

`ConversationType` расширен значением `'thread'`.

**Сервисы:**
- [`getThreadMessages(threadId, opts)`](../../src/services/api/messenger/messengerService.read.ts)
  — загрузка сообщений одного треда без `project_id`-фильтра. Использует
  только `eq('thread_id', threadId)` + `MESSAGE_SELECT` + `hydrateReplyMessages`.
- [`getConversations` / `createConversation`](../../src/services/api/knowledge/knowledgeConversationService.ts)
  — приняли опциональный `threadId`. При наличии фильтруют по `thread_id`,
  иначе — старая логика по `project_id`.

**Компоненты:**
- [`ProjectAiChat`](../../src/components/ai-panel/ProjectAiChat.tsx)
  принимает `threadId`. Когда задан + нет проекта:
  - `sessionKey = thread:<id>`, `conversationType = 'thread'`
  - Сообщения грузятся через `getThreadMessages`, не через `getProjectMessages`
  - Стартовый scope sources: `chats = { mode: 'selected', threadIds: [threadId] }`,
    knowledge = вся БЗ воркспейса (можно переключить)
  - Источники проекта (формы, документы, контекст) недоступны
- [`AiChatInput`](../../src/components/ai-panel/AiChatInput.tsx)
  получил `hasThread`. В thread-режиме вместо `ChatScopePicker`
  рендерится статичный чип `✦ Переписка треда · N` (число сообщений),
  скоуп зафиксирован. Empty state и placeholder инпута заточены под тред:
  «AI-ассистент по переписке», «Задайте вопрос по этой переписке...».
- [`AiPanelContent`](../../src/components/ai-panel/AiPanelContent.tsx)
  пробрасывает `threadId`. Контекст проекта в thread-режиме форсированно
  отключён.
- [`useProjectAiConversations`](../../src/components/ai-panel/hooks/useProjectAiConversations.ts)
  — `threadId` фильтрует пул диалогов и сохраняется при создании.

**Подключение в боковой панели:**
- [`TaskPanelTabContents`](../../src/components/tasks/TaskPanelTabContents.tsx)
  `SystemTabBody` принимает `standaloneThreadId`. В standalone-режиме
  разрешена единственная системная вкладка — `'assistant'` — она
  рендерит `AiPanelContent` с `threadId`. Остальные системные разделы
  требуют проекта (`tasks`, `documents`, `history`, etc.) и в standalone
  скрыты с подсказкой «Откройте проект…».
- [`usePanelTabsVisibility`](../../src/components/tasks/usePanelTabsVisibility.ts)
  уже добавлял `'assistant'` когда `projectId IS NULL` — менять не пришлось.

## Миграции / Edge Functions

- [`knowledge_conversations.thread_id`](../../supabase/migrations/) —
  применена через MCP `apply_migration`, в локальные миграции файл
  не положен (приватная миграция MCP не пишется в репо). При следующем
  массовом ребейзе локальной истории нужно будет учесть.
- Регенерация типов: `supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts`.

## Файлы

- Новые:
  - `src/components/tasks/PanelStandaloneInfoRow.tsx`
  - `src/components/tasks/useStandaloneTabs.ts`
- Изменения:
  - `src/components/tasks/TaskPanelTabbedShell.tsx`,
    `TaskPanelTabbedShellRenderer.tsx`, `TaskPanelTabContents.tsx`
  - `src/components/ai-panel/{AiChatInput,AiPanelContent,ProjectAiChat}.tsx`
  - `src/components/ai-panel/hooks/useProjectAiConversations.ts`
  - `src/services/api/messenger/{messengerService.ts,messengerService.read.ts}`
  - `src/services/api/knowledge/{knowledgeConversationService.ts,knowledgeSearchService.types.ts}`
  - `src/types/database.ts`

## Известные ограничения

- **Локальная миграция не положена.** Колонка добавлена через MCP
  `apply_migration` напрямую в remote. В `supabase/migrations/` файла нет.
  Если в будущем потребуется `supabase db reset` локально — нужно создать
  файл миграции вручную.
- **«История» (`history`) недоступна в standalone.** Этот раздел показывает
  активность тредов внутри проекта — для personal dialog без проекта
  не имеет смысла. Остаётся только `assistant`.
- **Диалоги ассистента в standalone теряются при перезагрузке страницы?**
  Нет — они сохраняются в БД по `thread_id`. Теряются только in-memory
  ad-hoc вкладки (сама вкладка ассистента в TabBar) — при следующем
  открытии диалога её придётся снова открыть через «+». Когда вкладка
  вновь открыта — список диалогов и их история подгрузятся из БД.
- **Pixel-perfect одинаковость info-row.** `PanelStandaloneInfoRow`
  использует иконку `MessageSquare` (тред) против `User` (контакт) /
  иконки проекта — иконка отличается, всё остальное (высота, паддинги,
  фон, ×) идентично.
