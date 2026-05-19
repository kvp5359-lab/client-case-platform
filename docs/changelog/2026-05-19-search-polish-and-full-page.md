# Поиск: цвет иконок, иконки проектов, однострочный layout, страница /search

**Дата:** 2026-05-19
**Тип:** feature (polish) + migration (db)
**Статус:** completed

---

## Контекст

Вчера задеплоили глобальный поиск в сайдбаре. В использовании всплыли
полировочные правки:

1. Иконки тредов рисовались серым — попросили взять цвет из настроек
   треда (`accent_color`).
2. Иконки проектов в дропдауне — все одинаковые серые папки. Хотелось
   как в сайдбарном списке проектов: икона из шаблона + цвет (fixed
   или from-status).
3. Двухстрочный layout (название + проект под ним) занимал много места.
   Хотелось одну строку: «Название треда» + название проекта серым
   справа в той же строке.
4. При поиске — если результат уже в «Недавнее», показывать его сверху
   через разделитель.
5. Enter в строке поиска → переходить на полноценную страницу поиска
   с расширенными лимитами.

## Главное 1: цвет иконок тредов и сообщений

`accent_color` у тредов в БД — это **семантический ключ** Tailwind-палитры
(`slate`, `violet`, `rose`, `emerald` …), не CSS-цвет. Первая наивная
попытка применить как inline `style.color = accent_color` дала случайный
результат: «violet» сработал как HTML named color, а «slate» / «rose»
браузер проигнорировал.

Фикс: использовать существующий маппинг
[`COLOR_TEXT`](../../src/components/messenger/threadConstants.ts) (тот же,
что у `TaskRow`, `UnreadBadge` и пр.). `slate` → `text-stone-600`,
`violet` → `text-violet-600`, `rose` → `text-red-500` и т.д.

Расширена сигнатура RPC `global_search` и `get_recently_viewed`: теперь
возвращают колонку `accent_color text` для строк с `entity_type IN
('thread', 'message')`. Для остального — NULL.

## Главное 2: иконки проектов через шаблон

`useSidebarData` обогащает каждый проект `iconId` (из
`project_templates.icon`) и `iconColor` (по `icon_color_mode`: fixed или
from-status). В новом дропдауне поиска воспроизводим тот же резолв.

### Расширение RPC

Добавлены колонки `project_template_id uuid` и `project_status_id uuid`
в выдачу `global_search` и `get_recently_viewed`. Для тредов/сообщений —
template/status их **проекта** (через JOIN). Для самой строки-проекта —
своя пара. Для статей KB / контактов — NULL.

### Резолв на фронте

Не дёргаем `project_templates` и `statuses` отдельно — берём их из
кэша, который **уже** заполняет `useSidebarData` (queryKeys
`sidebarMetaKeys.templatesIcons` / `statusesColors`). Новые хуки
[`useProjectTemplateIcons`, `useProjectStatusColors`,
`useProjectIconResolver`, `resolveProjectIcon`](../../src/hooks/useGlobalSearch.ts)
— переиспользуют те же queryKeys, кэш общий, второго похода в БД нет.

В `EntityIcon` для `type='project'`:

```tsx
const { iconId, iconColor } = resolveProjectIcon(templateId, statusId)
return createElement(getProjectIcon(iconId), {
  size,
  style: { color: safeCssColor(iconColor || '#6B7280') },
})
```

`getProjectIcon` и `safeCssColor` — те же утилиты, что использует
`ProjectListItem` в основном сайдбаре. Один-в-один с тем, как
рисуется проект в списке.

## Главное 3: однострочный layout

Раньше каждая строка в дропдауне — два уровня: title + subtitle под ним.
Теперь — одна строка, имя проекта inline-серым после названия треда:

```tsx
<div className="text-sm text-gray-800 truncate">
  <span>{row.title}</span>
  {row.subtitle && (
    <span className="text-gray-400 ml-2 font-normal">{row.subtitle}</span>
  )}
</div>
```

Сниппеты сообщений и статей остались отдельной строкой ниже (там есть
ts_headline с `<mark>`).

Заодно расширил попап до 440px (было 280–360) — длинные названия + имя
проекта влезают.

## Главное 4: «Недавнее» наверху поисковых результатов

Идея: если найденный элемент пользователь недавно открывал — это
повышенная релевантность, показываем сверху.

В `searchSections` рассчитываются:
- `Set` ключей `entity_type:entity_id` из текущего `recent`
- результаты поиска разбиваются: `fromRecent` (есть в Set) и `rest`
- `rest` группируется по типу как раньше

UI:
- Если `fromRecent.length > 0` → секция «НЕДАВНЕЕ» сверху + тонкая
  серая полоска-разделитель
- Дальше группы по типу: «ТРЕДЫ», «ПРОЕКТЫ», «БАЗА ЗНАНИЙ», «КОНТАКТЫ»,
  «СООБЩЕНИЯ»

Реализация — чистая функция в `useMemo`, тип `DisplayRow` унифицирует
обе модели (`GlobalSearchRow` и `RecentlyViewedRow`).

## Главное 5: страница `/workspaces/[id]/search`

### Маршрут

[`src/app/(app)/workspaces/[workspaceId]/search/page.tsx`](../../src/app/(app)/workspaces/[workspaceId]/search/page.tsx)
→ [`SearchPage`](../../src/page-components/SearchPage/index.tsx).

### Контракт с сайдбаром

В `SidebarGlobalSearch` инпут получил `onKeyDown`:

```tsx
if (e.key === 'Enter' && workspaceId && query.trim().length >= 2) {
  router.push(`/workspaces/${workspaceId}/search?q=${encodeURIComponent(query.trim())}`)
  setQuery('')
  setIsOpen(false)
}
```

Тот же handler — в `SearchInputInline` компактной версии (внутри попапа
при свёрнутом сайдбаре).

### Что на странице

- Шапка с тем же input (autofocus, можно менять запрос — URL
  обновляется через `window.history.replaceState`, без перезагрузки)
- 5 групп результатов с count'ом (`ТРЕДЫ · 4`, `СООБЩЕНИЯ · 40` …)
- **Лимит 40** на тип (вместо 8 в попапе) — `useGlobalSearch(workspaceId,
  query, 40)`. Хук получил необязательный параметр `limit`.
- Сниппеты НЕ обрезаются до 2 строк (на странице места достаточно)
- Иконки и цвета — те же резолверы, что в попапе

Без секции «Недавнее» (это страница чистого поиска).

### Хук `useGlobalSearch`

Сигнатура: `useGlobalSearch(workspaceId, debouncedQuery, limit = 8)`.
`limit` участвует в queryKey, так что попап (8) и страница (40)
кэшируются раздельно для одного и того же запроса.

## Файлы

### Миграции

[`supabase/migrations/20260518_global_search_accent_color.sql`](../../supabase/migrations/20260518_global_search_accent_color.sql)
— добавил `accent_color` в RPC.

[`supabase/migrations/20260518_global_search_project_icons.sql`](../../supabase/migrations/20260518_global_search_project_icons.sql)
— добавил `project_template_id` + `project_status_id`.

Обе применены в продакшен Supabase.

### Хуки

[`src/hooks/useGlobalSearch.ts`](../../src/hooks/useGlobalSearch.ts) —
расширены типы, добавлены 4 экспорта: `useProjectTemplateIcons`,
`useProjectStatusColors`, `useProjectIconResolver`, `resolveProjectIcon`.
`useGlobalSearch` получил параметр `limit`.

### Компоненты

[`src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx`](../../src/components/WorkspaceSidebar/SidebarGlobalSearch.tsx)
— почти полная переписка: унифицированный `DisplayRow`, секция
«Недавнее» внутри поиска, иконки проектов через `getProjectIcon`,
однострочный layout, Enter → `/search`.

[`src/page-components/SearchPage/index.tsx`](../../src/page-components/SearchPage/index.tsx)
— новая страница.

[`src/app/(app)/workspaces/[workspaceId]/search/page.tsx`](../../src/app/(app)/workspaces/[workspaceId]/search/page.tsx)
— тонкий route.

## Известные ограничения / на будущее

- **Keyboard navigation в попапе** (↑↓ стрелки + Enter для выбора)
  пока не реализована. Только клик мышью и Enter → /search.
- **Outline-кольцо у фокусированной строки в попапе** для
  keyboard-навигации потребуется когда добавим стрелки.
- **На странице /search** нет фильтров «только треды» / «только база
  знаний» — все 5 типов всегда. Если в будущем будет шум — добавить
  чипы-фильтры сверху.
- **Cmd+K** — глобальный хоткей фокуса в строку поиска — пока нет.
  Тривиально добавить отдельной итерацией (1 `useEffect` на keydown).
- **Recent в «Недавнее» при поиске** включает только сами треды/
  проекты/статьи/контакты — не сообщения. Сообщения никогда не
  трекаются в `recently_viewed` (открывается тред, а не сообщение).
