# Карточка контакта: все треды участия по проектам + панель по умолчанию отжимает контент

**Дата:** 2026-07-18
**Тип:** feat (фронт: карточка контакта, layout панели) + БД (новая RPC)
**Статус:** деплой (push в main → CI/CD blue/green; миграция уже в проде через MCP)

---

Две независимые задачи одной сессии. Продуктовые решения и границы охвата — на
данных прода (SQL-замеры реальной заполненности связей), geometry-фиксы — замерами
в браузере, не по догадкам.

## 1. Карточка контакта показывает все треды участия, сгруппированные по проектам (feat)

**Запрос.** Раньше карточка контакта (`ContactCardDialog`) показывала только прямой
чат + плоский список «Переписки» (треды, где контакт — собеседник). Нужно видеть
ВСЕ треды, где контакт участвует. Опасение владельца — у контакта-сотрудника это
будут сотни тредов; нужно не перегрузить.

**Охват (решён на данных прода).** Замер показал: единственная реально заполненная
связь сегодня — `project_threads.contact_participant_id` (собеседник);
`projects.contact_participant_id` = 0 из 244, `project_participants` для контактов —
1 запись. Поэтому объединяющий охват сделан «на будущее», а сегодня для большинства
контактов это те же треды, но структурированные:
- собеседник треда (`contact_participant_id`);
- личные TG-диалоги по числовому `telegram_user_id`
  (`mtproto_client_tg_user_id` / `business_client_tg_user_id`);
- треды проектов клиента (`project_participants` ИЛИ `projects.contact_participant_id`).

**Реализация.**
- Новая RPC `get_contact_participation_threads(p_participant_id)` — объединение
  сигналов + серый префикс проекта из шаблона (`default_name_prefix` под гейтом
  `show_name_prefix_in_sidebar`). `SECURITY INVOKER` → RLS режет выдачу под
  смотрящего (рядовой сотрудник видит только доступные ему треды). Гранты
  `authenticated`/`service_role`, `REVOKE anon`. Всё одним запросом — доп. запросов
  на иконки/даты/префиксы нет (ответ на «не перегрузить»).
- `useContactThreads` переведён на RPC; удалён дублирующий `useDirectChatThreads`.
- UI (`ContactThreadGroups`): группировка по проектам со сворачиванием, ленивым
  рендером, поиском по тредам И проектам; строка треда = цветная иконка канала
  слева → название (обрезается) → дата; заголовок проекта = серый префикс (как в
  сайдбаре) + название (жирнее) + `(N)` + дата свежайшего треда. Проекты
  сортируются по свежести.

**Фикс ширины (замер в браузере).** `DialogContent` — CSS-grid, его элементы имеют
`min-width:auto` и не сжимаются под контент → длинные названия распирали диалог,
`truncate` не срабатывал. Решение — `min-w-0` на grid-элементе; каскадом `truncate`
заработал. Подтверждено: `scrollWidth === clientWidth`, строки не выходят за границу.

**Раунд ревью (тем же заходом).** По итогам критического разбора:
- чистая логика группировки/фильтра вынесена в `lib/contacts/contactThreadGrouping.ts`
  (+9 тестов); дата группы = `max` по её тредам (не зависит от порядка RPC);
- компоненты группировки вынесены в `ContactThreadGroups.tsx` (`ContactCardDialog`
  638 → 420 строк, под порогом 500);
- общий `ProjectNamePrefix` — дедуп серого префикса сайдбар ↔ карточка;
- тип RPC в `database.ts` помечен nullable у необязательных колонок;
- запись новой функции добавлена в `schema-manifest.json` (без регенерации всего —
  чтобы не затянуть чужой дрейф).

Проверено в браузере: карточка контакта-сотрудника с 358 тредами — группы по
проектам свёрнуты, префиксы/счётчики/даты/поиск работают, длинные названия
обрезаются, горизонтального переполнения нет.

## 2. Правая панель по умолчанию отжимает контент, доски — overlay (feat)

**Запрос.** При открытой боковой панели контент должен сужаться (панель — правая
половина) ВЕЗДЕ, кроме досок (доскам нужна полная ширина + горизонтальный скролл
колонок).

**Решение.** Инверсия поведения в `globals.css`: push стал дефолтом
(`body[data-panel-open] main { margin-right }` под `@media ≥768px`), overlay —
исключение (`data-panel-mode="overlay"`). Убраны точечные push-сеттеры со страниц
задач/документов/финансов/обновлений (теперь дефолт) и устаревшее правило
`.project-tabs-cq` (ряд вкладок теперь внутри суженного `main`). `BoardsPage`
переведён на `overlay`. На мобиле (<768px) панель — fullscreen overlay, `main` не
сужается.

Проверено в браузере: анкета проекта сузилась в левую половину (все поля видны, не
уходят под панель); доска осталась во всю ширину с панелью поверх; на странице
проекта с открытой панелью `mainOverflowX: false` на Задачи/Документы/Анкеты/Финансы
— контент помещается, ряд вкладок сворачивается в «≡».

## Проверки

- lint 0, tsc 0, новые тесты `contactThreadGrouping` — 9/9 зелёные.
- Карточка, сайдбар (префиксы), push-вкладки — замеры и визуальная сверка в браузере.
- RPC-охват сверен на реальных контактах прода (ABC-spain: 6 тредов = 4 личных +
  группа проекта с 2 письмами; сотрудник с 358 тредами — группировка держит).

## Затронутые файлы

Панель (`e1fa2e36`): `src/app/globals.css`, `src/components/tasks/TaskListView.tsx`,
`src/components/documents/DocumentsTabContent.tsx`,
`src/components/projects/finance/FinanceTabContent.tsx`,
`src/page-components/SourceUpdatesPage/index.tsx`,
`src/page-components/BoardsPage/index.tsx`.

Карточка контакта (`843ff062`):
`supabase/migrations/20260718120000_contact_participation_threads.sql`,
`src/hooks/useContactCard.ts`, `src/types/database.ts`,
`src/components/contacts/ContactCardDialog.tsx`,
`src/components/contacts/ContactThreadGroups.tsx`,
`src/components/shared/ProjectNamePrefix.tsx`,
`src/components/WorkspaceSidebar/ProjectListItem.tsx`,
`src/lib/contacts/contactThreadGrouping.ts`,
`src/lib/contacts/contactThreadGrouping.test.ts`,
`supabase/schema/schema-manifest.json`.
