# Страница «Проекты» в стиле задач + тихие статусы задач

**Дата:** 2026-04-20
**Тип:** feat
**Статус:** completed

---

## Контекст

Две несвязанные задачи, уехали одним релизом.

1. **Страница «Проекты»** выглядела чужеродно по сравнению с «Задачами»: другой контрол поиска/фильтров, Card + Table с бордерами по бокам, высокие строки, нет аватарок участников, нет бейджа непрочитанного по проекту. Юрист с 10+ активными проектами не мог взглядом оценить, где что-то горит.
2. **Смена статуса задачи** всегда попадала в `unread_event_count` — у участников задачи рос бейдж непрочитанного. При массовом переходе «Завершено» в конце дня клиент получал 20 уведомлений о закрытиях задач, которых он уже не касается.

## Решение

### 1. «Тихие» статусы задач

Новый флаг `statuses.silent_transition boolean default false` (миграция [`20260420_status_silent_transition.sql`](../../supabase/migrations/20260420_status_silent_transition.sql)). В `StatusFormDialog` — чекбокс «Не уведомлять о переходе» (только для `entity_type = 'task'`). По умолчанию выключен — существующие статусы продолжают работать как раньше.

Пересоздан RPC [`get_inbox_threads_v2`](../../supabase/migrations/20260420_status_silent_transition.sql): в CTE `unread_audit` добавлен LEFT JOIN на `statuses` по `new_status` из `audit_logs.details`, и добавлен предикат
`(al.action <> 'change_status' OR COALESCE(s_new.silent_transition, false) = false)`.
Переход в «тихий» статус **остаётся в истории** (запись в `audit_logs` не трогаем, видна в ленте чата), но не учитывается в `unread_event_count`.

RPC сохранений статуса (`update_status_with_button_label` / `create_status_with_button_label`) про новое поле не знают, поэтому `useStatusesDirectory` при редактировании делает дополнительный `supabase.from('statuses').update({ silent_transition })` — ту же технику мы уже используем для `icon` и `show_to_creator`.

### 2. Страница «Проекты»

Переписана целиком на стилистику `TasksPage` / `TaskListView`. Общие компоненты с задачами — напрямую переиспользованы, не дублированы.

#### Шапка и фильтры

- [`ProjectPresetPopover`](../../src/components/projects/filters/ProjectPresetPopover.tsx) — визуальный клон `TaskPresetPopover`: сдвоенная кнопка «пресет + chevron», пресеты «Активные / Завершённые / Архив / Все проекты».
- Фильтры в отдельной строке при раскрытии: [`ProjectStatusFilter`](../../src/components/projects/filters/ProjectStatusFilter.tsx), [`ProjectAssigneeFilter`](../../src/components/projects/filters/ProjectAssigneeFilter.tsx), [`ProjectTemplateFilter`](../../src/components/projects/filters/ProjectTemplateFilter.tsx). Все три используют общие примитивы `FilterButton` / `CheckItem` / `FilterToolbar` из [`src/components/tasks/filters/FilterPrimitives.tsx`](../../src/components/tasks/filters/FilterPrimitives.tsx) — один визуальный язык.
- Поиск, кнопка «Создать проект» — теми же классами, что в `TaskListControls` (h-9, bordered, та же высота и отступы).

#### Строка проекта

Card + Table удалены. Теперь плоский список с `border-b border-border/50` между строками, без бордеров по бокам. Схема строки:

```
[📁 иконка]  имя · шаблон · описание  | [hover] участники-по-ролям | бейдж | ────> | статус | дата | ⋯
```

- **Имя и шаблон — `shrink-0`**, описание — `truncate min-w-0` (приоритет у имени: сначала обрезается описание, а не имя).
- **Шаблон проекта** берётся из `projects.template_id`, отображается оранжевым цветом иконки папки с `opacity-50`.
- **Иконка папки** — `getStatusIconColor(status)` из [`projectListConstants`](../../src/components/WorkspaceSidebar/projectListConstants.ts) (архивные — полупрозрачные).
- **Участники по ролям** — сгруппированы через `project_participants.project_roles`, порядок ролей через `project_roles.order_index`. Рендерится компонентом [`ParticipantAvatars`](../../src/components/participants/ParticipantAvatars.tsx), размер `sm` (18×18), между группами — разделитель `·`. **Показываются только при hover строки** — в обычном состоянии список чистый; через `hidden group-hover/row:flex has-[[data-state=open]]:flex` остаются видны, пока открыт попап (иначе при уходе курсора Radix терял trigger и попап улетал в угол).
- **Бейдж непрочитанного по проекту** — агрегируется через `useSidebarInboxCounts` (тот же хук, что в сайдбаре). Поддерживает `number`, `emoji`, `dot`. Цвет — из `badgeColors` хука.
- **Статус** — [`ProjectStatusPopover`](../../src/components/projects/ProjectStatusPopover.tsx). Клик по бейджу статуса открывает popover с четырьмя вариантами. Пишет напрямую в `projects.status`, инвалидирует `projectKeys.byWorkspace`. Блокируется, если нет прав `edit_all_projects`.

#### Интерактивность — переиспользование компонентов задач

Клик на группу аватарок открывает **тот же самый** `AssigneesPopover` из [`src/components/tasks/AssigneesPopover.tsx`](../../src/components/tasks/AssigneesPopover.tsx), что и в задачах — с поиском и группировкой «Сотрудники / Внешние сотрудники / Клиенты». Чтобы переиспользовать без дубликата кода, в controlled-режим компонента добавлены два опциональных параметра:

- `triggerOverride?: React.ReactNode` — если передан, заменяет стандартную кнопку-заглушку.
- `align?: 'start' | 'center' | 'end'` — выравнивание PopoverContent.

На странице проектов каждая группа ролей оборачивается в `<AssigneesPopover mode="controlled">` с `triggerOverride={<button>аватарки</button>}` и `onToggle` → мутация `toggleRoleParticipantMutation`, которая корректно добавляет/убирает роль в `project_participants.project_roles` (и удаляет запись, если ролей не осталось).

#### Бейдж унифицирован по размерам

Ранее в [`src/components/tasks/UnreadBadge.tsx`](../../src/components/tasks/UnreadBadge.tsx) `emoji`-ветка была 20×20 — на 2px больше, чем статус и аватарка исполнителя (18×18). Подняли размер шрифта до 12px и сделали 20×20 → потом вернулись на 18×18 с `text-[10px]`, чтобы все три элемента в строке задачи были одного размера (проверено через `preview_eval` по DOM: status=18, avatar=18, badge=18). Попутно и в задачах, и в проектах бейдж «реакция» теперь всегда в кружке акцентного цвета, не голый эмодзи.

#### Порядок элементов в строке — итеративно

- Сначала бейдж стоял после участников → пустовало место при скрытых участниках → перенесли сразу после описания.
- Потом «пропадало» ощущение связки «участники-бейдж» → окончательно: `участники → бейдж`, оба в правом блоке рядом, а `status → дата → меню` прижаты к правому краю через `ml-auto`.

## Архитектурные моменты

- **Не дублировали** компоненты фильтров/popover'ов — всё, что возможно, переиспользуется из `src/components/tasks/*`. Единственное локальное — `ProjectPresetPopover` (у проектов другие пресеты) и три визуально-тонкие обёртки над общими примитивами.
- **`AssigneesPopover` стал чуть более reusable** — `triggerOverride` и `align`. Поведение в тасках не изменилось (новые поля опциональны, ветка triggerOverride срабатывает только при наличии).
- **`toggleRoleParticipantMutation`** — простая toggle-мутация в `ProjectsPage`, инкапсулирует логику: нет записи → insert, есть → поменять `project_roles`, если после удаления роль пустая → delete. Без зависимости от тяжёлого `useProjectParticipantsMutations`, потому что там куча лишнего (share briefs, client-confirm dialog и т.п.).

## Бэклог

Записали [план по персональным Telegram-ботам сотрудников](../feature-backlog/2026-04-20-telegram-per-employee-bots.md) — идея с отдельным ботом на каждого юриста, чтобы клиент видел правильную аватарку и имя при отправке сообщений из сервиса. Пока на обдумывании, не делаем.
