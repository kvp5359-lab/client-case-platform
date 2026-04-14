# Точный счётчик реакций и визуальные индикаторы непрочитанных

**Дата:** 2026-04-14
**Тип:** feat + fix
**Статус:** completed

---

## Проблема

Три связанные проблемы с отображением непрочитанных в инбоксе и внутри тредов:

1. **Нельзя было различить 1 и N непрочитанных реакций.** RPC `get_inbox_threads_v2` отдавал только булев `has_unread_reaction` и последний `last_reaction_emoji`. Фронт в бейдже всегда засчитывал реакции как `+1`, независимо от их числа. Пользователь с двумя непрочитанными реакциями в чате видел эмодзи одной из них, а не «2».

2. **`unread_event_count` терялся при рендере бейджей и кнопки «Прочитано/Непрочитано».** Если задача создавалась другим пользователем, в инбоксе у треда был `unread_event_count = 1`, бейдж `1` показывался в списке задач, но:
   - На вкладке-табе задачи в панели «Чаты» бейджа не было — `useMessengerPanelData` не прокидывал `unread_event_count` в `unreadByThreadId`, и `MessengerPanelContent` не передавал его в `getBadgeDisplay` для кастомных тредов.
   - Внутри самой задачи внизу висела кнопка **«Непрочитано»** (переключатель, предлагающий пометить непрочитанным) — хотя по факту был непрочитанный пункт. Формула `showUnread` в `useMessengerState` учитывала только `unreadCount`, `isManuallyUnread`, `hasUnreadReaction`, но не audit-события.

3. **Не было визуальной подсветки непрочитанных сообщений, реакций и audit-событий** внутри треда. Разделитель «Непрочитанные» был, но сами элементы после него выглядели одинаково с прочитанными.

## Решение

### 1. Счётчик реакций (feat)

**Миграция** `20260415_inbox_unread_reaction_count.sql`: в RPC `get_inbox_threads_v2` добавлено поле `unread_reaction_count bigint`. Считается в новом CTE `unread_reaction_counts` — `COUNT(*)` чужих реакций после `last_read_at` пользователя. Старое поле `has_unread_reaction` сохранено, т.к. используется для превью «Alice отреагировал(а) 👍 на …» в `InboxChatItem`.

**Логика бейджа** в `src/utils/inboxUnread.ts`:
- `getBadgeDisplay`: если сообщений нет и реакций ровно 1 → эмодзи; если 2+ или есть сообщения → число (`unread_count + unread_reaction_count + unread_event_count`).
- `getAggregateBadgeDisplay` (для сайдбара проекта, вкладки «Чаты»): эмодзи показывается только если по всему списку тредов в сумме ровно 1 непрочитанная реакция и больше ничего.

Добавлен хук `useUnreadReactionCount` в `useInbox.ts` — возвращает сумму непрочитанных реакций по тредам проекта/канала. Пробрасывается через `useMessengerPanelData` в `MessengerPanelContent`, чтобы бейдж client-канала на вкладке чатов тоже различал 1 и 2+ реакции.

### 2. Потеря `unread_event_count` (fix)

- `useMessengerPanelData`: добавлено поле `eventCount` в словарь `unreadByThreadId` — хранит `t.unread_event_count ?? 0` для каждого треда.
- `MessengerPanelContent`: при составлении `getBadgeDisplay` для кастомного треда теперь передаётся `unread_event_count: threadUnread?.eventCount ?? 0`.
- `useMessengerState`: новый хук `useUnreadEventCount(workspaceId, threadId)` читает `unread_event_count` конкретного треда из инбокс-кэша. Формула `showUnread` обновлена: `unreadCount > 0 || isManuallyUnread || hasUnreadReaction || unreadEventCount > 0`.

Теперь задача с одним событием «создана» даёт:
- бейдж `1` на вкладке-табе в панели «Чаты» (как и в списке задач);
- кнопку **«Прочитано»** (не «Непрочитано») внутри задачи — правильный переключатель.

### 3. Визуальная подсветка непрочитанных (feat)

**Сообщения** (`MessageBubble.tsx`): у чужого сообщения с `created_at > lastReadAt` (или если `lastReadAt` отсутствует — тред не открывался ни разу) — добавляется `border-l-4 border-red-500` на сам пузырь, красная полоса внутри слева.

**Реакции** (`ReactionBadges.tsx`): если хотя бы одна реакция с данным эмодзи оставлена чужим после `lastReadAt` — таблетка реакции рендерится в красной палитре (`bg-red-50 border-red-300 text-red-600`) вместо стандартной.

**Audit-события** (`MessageList.tsx` → `ServiceMessage`): если событие чужое и после `lastReadAt` (или тред не читался) — пилюля становится красной (`text-red-600 bg-red-50 border-red-300`). Для этого в `ThreadAuditEvent` экспонировано поле `user_id` (раньше выбиралось из БД, но не отдавалось наружу типом).

**Кнопка «Прочитано»** (`ReadUnreadButton.tsx`): перекрашена из синих тонов в красные (`border-red-300`, `text-red-600`, hover `bg-red-50`) — визуально согласуется с остальной подсветкой непрочитанного.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `supabase/migrations/20260415_inbox_unread_reaction_count.sql` | Новая миграция: добавлен `unread_reaction_count` в `get_inbox_threads_v2`. |
| `src/types/database.ts` | Поле `unread_reaction_count: number` в Returns RPC. |
| `src/services/api/inboxService.ts` | Поле `unread_reaction_count` в интерфейсе `InboxThreadEntry`. |
| `src/utils/inboxUnread.ts` | Новая логика `getBadgeDisplay` / `getAggregateBadgeDisplay`, хелпер `reactionCount`. Поддержка fallback на булев флаг, если новое поле отсутствует. |
| `src/utils/inboxUnread.test.ts` | Новые кейсы: 2 реакции в одном треде, 2 треда с 1 реакцией каждый. |
| `src/hooks/messenger/useInbox.ts` | Новые хуки `useUnreadReactionCount`, `useUnreadEventCount`. |
| `src/hooks/messenger/useMessengerPanelData.ts` | Проброс `clientReactionCount`, `eventCount` в бейджи. |
| `src/components/MessengerPanelContent.tsx` | Передача `unread_reaction_count` и `unread_event_count` в `getBadgeDisplay`. |
| `src/components/boards/BoardInboxList.tsx` | Оптимистичное обновление при mark-as-read зануляет `unread_reaction_count`. |
| `src/hooks/messenger/useFilteredInbox.test.ts` | Обновлены фикстуры. |
| `src/components/messenger/hooks/useMessengerState.ts` | `showUnread` теперь включает `unreadEventCount > 0`. |
| `src/hooks/messenger/useThreadAuditEvents.ts` | В тип `ThreadAuditEvent` добавлено поле `user_id`. |
| `src/components/messenger/MessageBubble.tsx` | Красная полоса слева у непрочитанных чужих сообщений. |
| `src/components/messenger/MessageList.tsx` | Красная пилюля у непрочитанных audit-событий. |
| `src/components/messenger/ReactionBadges.tsx` | Красная палитра у непрочитанных реакций. |
| `src/components/messenger/ReadUnreadButton.tsx` | Кнопка «Прочитано» в красных тонах. |

## Доработки

**Мигание подсветки на старте** (коммит `d814fff`): при первой загрузке страницы `useLastReadAt` отдавал `data = undefined` во время запроса. Логика `!lastReadAt || created_at > lastReadAt` трактовала это как «тред никогда не читался» и красила все чужие баблы/события красным на ~1 секунду, пока не приходил настоящий `last_read_at`. Решение: проброшен `isPending` из React Query через `MessengerTabContent` → `MessageList` как `isLastReadAtLoaded`. Пока запрос не завершён, подсветка не применяется, так что мигания больше нет.

**Цвет непрочитанных реакций**: `bg-red-50 border-red-300` → `bg-red-100 border-red-500`. Фон чуть ярче, контур насыщеннее — чтобы подсветка читалась однозначно.

## Проверки

- Vitest: 613/613 ✅
- ESLint: 0 ошибок, 0 предупреждений ✅
- `tsc --noEmit`: без ошибок ✅
- Миграция применена в прод через Supabase MCP.
