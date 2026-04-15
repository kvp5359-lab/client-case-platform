# AI-ассистент: единый picker скоупа чатов вместо «Клиенты/Команда»

**Дата:** 2026-04-15
**Тип:** feat (breaking — формат `sources` в БД)
**Статус:** completed

---

## Проблема

В ассистенте было два жёстких источника — «Клиенты» и «Команда» — соответствующих двум легаси-каналам сообщений. После рефакторинга чатов в проекте появилось много тредов разных типов (чаты, задачи), и старая бинарная модель перестала покрывать кейс «искать только в одном конкретном чате».

## Решение

Заменили два чипа одним picker-ом «Где искать», в котором:
- по умолчанию выбраны **все чаты проекта** (`mode: 'all'`);
- можно открыть popover и выбрать конкретные треды чекбоксами (`mode: 'selected'` + `threadIds`).

Теги «Клиенты»/«Команда» полностью убраны из UI.

## Что изменилось

### Типы

В [`knowledgeSearchService.types.ts`](../../src/services/api/knowledge/knowledgeSearchService.types.ts):

```ts
export interface ChatScope {
  mode: 'all' | 'selected'
  threadIds: string[]
}

export interface ConversationSources {
  chats: ChatScope
  formData: boolean
  documents: boolean
  knowledge: 'project' | 'all' | null
  // legacy-поля оставлены опциональными — для чтения старых записей
  clientMessages?: boolean
  teamMessages?: boolean
}
```

Добавлен helper `migrateLegacySources()`, который при чтении из БД/localStorage конвертирует старый формат в новый: если был хоть один true (`clientMessages` или `teamMessages`) → `mode: 'all'`, иначе `mode: 'selected'` с пустым массивом.

### Сервис

В [`messengerService.ts`](../../src/services/api/messenger/messengerService.ts) добавлена `getProjectMessages(projectId, threadIds | null)`. Если `threadIds === null` — грузит все сообщения проекта; иначе фильтрует по `thread_id IN (...)`.

Старая `getProjectMessagesByChannel` оставлена — нигде больше не используется, но удалена не была чтобы не плодить шум; можно почистить отдельным проходом.

### Хуки

- [`useAiSources.ts`](../../src/hooks/messenger/useAiSources.ts) — дефолт стал `{ chats: { mode: 'all', threadIds: [] }, ... }`. Добавлен `setChatScope(scope)`. `toggleSource` теперь принимает только `'formData' | 'documents'`.
- [`useMessengerAi.ts`](../../src/hooks/messenger/useMessengerAi.ts) — сигнатура: `chatMessages: ProjectMessage[]` (вместо `{ client, team }`) + новый параметр `chatScopeLabel`. Возвращает `setChatScope`.

### UI

- [`AiChatInput.tsx`](../../src/components/ai-panel/AiChatInput.tsx) — два чипа «Клиенты»/«Команда» заменены одним popover-чипом «Где искать»: «Все чаты» / «Выбрать чаты» (с чекбоксами). Лейбл показывает имя единственного выбранного треда или количество.
- [`ProjectAiChat.tsx`](../../src/components/ai-panel/ProjectAiChat.tsx) — грузит треды через `useProjectThreads`, передаёт их в picker. Сообщения для контекста загружаются по актуальному скоупу (через `getProjectMessages`).
- [`AiPanelContent.tsx`](../../src/components/ai-panel/AiPanelContent.tsx) — убран ныне ненужный проп `hasTeamMessagesAccess`.

### Совместимость

При восстановлении сохранённых диалогов (в `useProjectAiConversations` и `useProjectAiRestore`) старые `sources` прогоняются через `migrateLegacySources`. Записи в `knowledge_conversations.sources` сохраняются в новом формате; миграция данных не требуется — старые читаются прозрачно.

## Файлы

- `src/services/api/knowledge/knowledgeSearchService.types.ts`
- `src/services/api/knowledge/knowledgeSearchService.ts`
- `src/services/api/messenger/messengerService.ts`
- `src/services/api/messenger/messengerAiService.ts`
- `src/hooks/messenger/useAiSources.ts`
- `src/hooks/messenger/useMessengerAi.ts`
- `src/hooks/queryKeys.ts`
- `src/components/ai-panel/AiChatInput.tsx`
- `src/components/ai-panel/ProjectAiChat.tsx`
- `src/components/ai-panel/AiPanelContent.tsx`
- `src/components/ai-panel/hooks/useProjectAiConversations.ts`
- `src/components/ai-panel/hooks/useProjectAiRestore.ts`
- `src/store/sidePanelStore.types.ts`
- `src/store/sidePanelStore.test.ts`
- `src/store/sidePanelStore.localStorage.test.ts`
