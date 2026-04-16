# Поиск по всем проектам в сайдбаре + запоминание скорости аудио на пользователя

**Дата:** 2026-04-16
**Тип:** feat
**Статус:** completed

---

## Контекст

В сайдбаре список проектов ограничен топом по активности — раньше 25, теперь 35. При этом поиск по сайдбару фильтровал только эти 35 загруженных карточек. Если у воркспейса больше проектов (а у активных клиентов — от 50+), найти старый проект прямо из сайдбара было невозможно, приходилось идти в `/projects`.

Параллельная жалоба по мессенджеру: в аудио-плеере кнопка скорости (1x / 1.5x / 2x) сбрасывалась на 1x в каждом новом сообщении. Шаг 0.5 многим слишком крупный — между 1x и 1.5x комфортная скорость прослушивания у большинства пользователей где-то посередине.

## Решение

### 1. Лимит проектов в сайдбаре: 25 → 35

В [useSidebarData.ts](../../src/components/WorkspaceSidebar/useSidebarData.ts) в обоих запросах (для `view_all_projects` и для ограниченного доступа) поднят `.limit(25)` до `.limit(35)`. Перфом не страдает: список не виртуализирован, но 35 карточек сайдбар ест спокойно.

### 2. Серверный поиск по всем проектам

В `useSidebarData.ts` добавлен второй `useQuery`, который активируется при длине запроса ≥ 2 символов:

- Запрос: `projects.select('*').eq('workspace_id', ...).ilike('name', pattern).limit(50)`.
- Экранирование спецсимволов `% _ \` в пользовательском вводе, чтобы нельзя было сломать шаблон.
- Для пользователей без `view_all_projects` поиск ограничен проектами, где юзер является `project_participant` — те же права, что и на обычном списке.
- Дебаунс 250 мс в [WorkspaceSidebarFull.tsx](../../src/components/WorkspaceSidebarFull.tsx) — не дёргаем БД на каждую букву.
- При активном поиске хук отдаёт серверные результаты вместо топ-35; когда поле пустое — возвращается обычный список.

Новый ключ react-query: `sidebarKeys.projectsSearch(workspaceId, canViewAll, query)` в [queryKeys.ts](../../src/hooks/queryKeys.ts).

В [ProjectsList.tsx](../../src/components/WorkspaceSidebar/ProjectsList.tsx) добавлен проп `onSearchChange` — локальный ввод в поле поиска пробрасывается наверх.

### 3. Скорость аудио хранится в user_settings

Миграция `add_audio_playback_rate_to_user_settings` — новая колонка в `public.user_settings`:

```sql
audio_playback_rate numeric(3,2) NOT NULL DEFAULT 1.00
CHECK (audio_playback_rate >= 0.25 AND audio_playback_rate <= 4.00)
```

Новый хук [useAudioPlaybackRate.ts](../../src/hooks/useAudioPlaybackRate.ts):
- `useQuery` читает значение из `user_settings`.
- `useMutation` с `upsert` (onConflict=`user_id`) — если у пользователя ещё нет записи, она создастся.
- Оптимистичный апдейт кеша по ключу `userSettingsKeys.byUser(userId)` — **тому же**, что используется в `ProfilePage`. Значит кеш общий: один плеер меняет скорость → все открытые плееры синхронизируются мгновенно, профильная страница тоже видит актуальное значение.

В [AudioAttachmentPlayer.tsx](../../src/components/messenger/AudioAttachmentPlayer.tsx):
- Убран локальный `useState` для скорости.
- `cycleRate` хука переключает по циклу `0.75 → 1 → 1.25 → 1.5 → 1.75 → 2 → 0.75` (шаг 0.25).
- `useEffect` применяет актуальную скорость к `<audio>` при загрузке аудио и при изменении значения извне.

## Файлы

- `supabase/migrations/*` — миграция `add_audio_playback_rate_to_user_settings` (колонка в `user_settings`)
- `src/components/WorkspaceSidebar/useSidebarData.ts` — лимит 25 → 35, серверный поиск через `ilike`
- `src/components/WorkspaceSidebar/ProjectsList.tsx` — проп `onSearchChange` для проброса ввода наверх
- `src/components/WorkspaceSidebarFull.tsx` — дебаунс поискового запроса 250 мс
- `src/hooks/queryKeys.ts` — ключ `sidebarKeys.projectsSearch`
- `src/hooks/useAudioPlaybackRate.ts` (new) — хук, общий кеш с профильной страницей
- `src/components/messenger/AudioAttachmentPlayer.tsx` — подключение хука, цикл с шагом 0.25
- `src/types/database.ts` — колонка `audio_playback_rate` в типах `user_settings`
