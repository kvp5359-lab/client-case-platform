# Шаблон проекта — заголовки/текст в задачах + перетаскивание анкет и документов

**Дата:** 2026-05-31
**Тип:** feature + UX
**Статус:** completed

---

## 1. Перетаскивание анкет и документов в редакторе типа проекта

**Было:** в редакторе типа проекта (вкладка «Модули») шаблоны задач можно
было перетаскивать, а анкеты и наборы документов — нет.

**Стало:** секции «Анкеты» и «Документы» получили drag-and-drop (как у задач).

- [`LinkedTemplatesList`](../../src/components/templates/project-template-editor/LinkedTemplatesList.tsx):
  общий компонент списка теперь поддерживает DnD через опциональный
  `onReorder`. Порядок применяется оптимистично прямо в кэше React Query
  (`onMutate` → `setQueryData`), при ошибке — откат к снапшоту (как у задач).
- [`useProjectTemplateMutations`](../../src/components/templates/project-template-editor/useProjectTemplateMutations.ts):
  добавлены `reorderFormsMutation` и `reorderDocKitsMutation` — пишут
  `order_index` по новому порядку в `project_template_forms` /
  `project_template_document_kits`.
- [`ModulesSection`](../../src/components/templates/project-template-editor/ModulesSection.tsx)
  + [`ProjectTemplateEditorPage`](../../src/components/templates/ProjectTemplateEditorPage.tsx):
  проводка `onReorderForms` / `onReorderDocKits`.

## 2. Заголовки и текстовые блоки в модуле «Задачи» шаблона

**Цель:** в шаблоне проекта, в списке задач, задавать структурные блоки —
«Заголовок» и «Текстовый блок» — вперемешку с задачами. При создании проекта
из шаблона они появляются на вкладке «Задачи» проекта в том же порядке
(сквозная единая логика; модуль «План» как отдельная сущность фактически не
используется, всё живёт в задачах).

- **Хранилище** — переиспользуем `project_template_plan_blocks` (типы
  `heading`/`text`). Новая миграция
  [`20260531_template_plan_heading_block.sql`](../../supabase/migrations/20260531_template_plan_heading_block.sql)
  разрешает `block_type='heading'` в шаблонной таблице (живая таблица его уже
  поддерживала). **Применена в проде.**
- [`ProjectTemplateThreadList`](../../src/components/templates/project-template-editor/ProjectTemplateThreadList.tsx):
  секция «Задачи» стала единым перетаскиваемым списком «задачи + заголовки +
  текст». Задачи — `thread_templates`, блоки — `project_template_plan_blocks`,
  общий `sort_order` на одной шкале; кнопки «+ Заголовок» / «+ Текст»,
  инлайн-редактирование, удаление. Богатое редактирование задач сохранено.
- [`useTemplatePlan`](../../src/hooks/plan/useTemplatePlan.ts): добавлены
  `addHeadingBlock`, опциональный `sort_order` у `addBlock`, `setBlockOrders`
  для единой перенумерации.
- [`TemplatePlanSection`](../../src/components/plan/TemplatePlanSection.tsx):
  рендер heading-блоков (чтобы они не выглядели как «удалённая задача» во
  вкладке «План», которая делит ту же таблицу).
- [`CreateProjectDialog`](../../src/components/projects/CreateProjectDialog.tsx):
  при создании проекта заголовки/текст разворачиваются в `project_plan_blocks`
  с сохранением типа (`heading`/`text`) и согласованного с задачами порядка
  (единая шкала `sort_order`). Исправлены 2 бага старого пути: heading больше
  не превращается в text; задачи и блоки нумеруются по одной шкале (раньше
  задачи `+100`, блоки `index` — порядок ломался).
- [`TemplateItemsList`](../../src/components/projects/create-project/TemplateItemsList.tsx):
  в окне «Создать проект» заголовки/текст показываются в списке «Задачи и
  чаты» (в общем порядке, с галочками — можно исключить). Добавлены иконки
  тредов после названий, ужаты отступы, увеличены/осветлены заголовки секций.

## Затронутые файлы

- `supabase/migrations/20260531_template_plan_heading_block.sql` (новый)
- `src/components/templates/project-template-editor/LinkedTemplatesList.tsx`
- `src/components/templates/project-template-editor/useProjectTemplateMutations.ts`
- `src/components/templates/project-template-editor/ModulesSection.tsx`
- `src/components/templates/project-template-editor/ProjectTemplateThreadList.tsx`
- `src/components/templates/ProjectTemplateEditorPage.tsx`
- `src/hooks/plan/useTemplatePlan.ts`
- `src/components/plan/TemplatePlanSection.tsx`
- `src/components/projects/CreateProjectDialog.tsx`
- `src/components/projects/create-project/TemplateItemsList.tsx`

## Проверки

- `npm run lint && npx tsc --noEmit && npm test` — зелёные (lint 0, tsc 0, 662 теста).
