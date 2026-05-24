# Слот AI-промпты, аккордеон-секции форм, разделение правил

**Дата:** 2026-05-24
**Тип:** feature + UX + docs
**Статус:** completed

---

## Контекст

Три отдельных блока работы за день:

1. **Документы** — раньше AI-промпт для проверки и именования был только
   на уровне папки. Если в одной папке лежат документы с разными
   требованиями (например, один слот «Загранпаспорт», другой
   «Свидетельство о рождении»), приходилось использовать один общий
   промпт на всю папку.
2. **Формы** — секции анкет визуально одинаковые, прогресс не виден,
   у клиента нет ощущения структуры.
3. **Правила** — `infrastructure.md` разросся до неудобоваримых размеров
   и смешивал стек/деплой с мессенджер-контрактами и фичами.

## 1. AI-промпты на уровне слотов

Иерархия выбора промпта при AI-проверке документа (`check-document` edge):

1. **Слот** — `folder_slots.ai_*_prompt` (если документ привязан к слоту
   через `folder_slots.document_id`)
2. **Папка** — `folders.ai_*_prompt`
3. **Дефолт воркспейса** — `workspaces.default_ai_*_prompt`

Каждый промпт (`ai_naming_prompt` и `ai_check_prompt`) резолвится
независимо: можно переопределить на слоте только проверку, а имя
унаследовать от папки.

### Унифицированный UI

Раньше у слота можно было задать только описание, у папки — описание +
два AI-промпта во вкладках. Теперь оба сущности используют один паттерн:

- Новый компонент [`EditSlotDialog`](../../src/components/templates/EditSlotDialog.tsx)
  — название + описание (радио-переключатель Текст/Статья БЗ) + два
  AI-промпта в одном окне без вкладок.
- [`FolderTemplateDialog`](../../src/components/templates/FolderTemplateDialog.tsx)
  и [`EditKitFolderDialog`](../../src/components/templates/document-kit-template-editor/EditKitFolderDialog.tsx)
  переписаны под тот же layout (один экран, радио).
- [`SlotsEditor`](../../src/components/templates/SlotsEditor.tsx)
  рендерит слоты как inline-чипы в стиле проектных папок: янтарная
  пунктирная обводка, hover-кнопки Pencil/Trash, круглая «+» с
  dropdown (Новый слот / Из справочника).
- Старый [`SlotTemplateDialog`](../../src/components/templates/SlotTemplateDialog.tsx)
  удалён, [`SlotTemplatesContent`](../../src/components/templates/SlotTemplatesContent.tsx)
  переведён на `EditSlotDialog`.

### Цепочка копирования полей

`slot_templates` → `folder_template_slots` / `document_kit_template_folder_slots`
→ `folder_slots`. Поля копируются по списку: `name`, `description`,
`knowledge_article_id`, `ai_naming_prompt`, `ai_check_prompt`. Не
live-reference — изменения в справочнике не затрагивают уже созданные слоты.

## 2. Аккордеон-секции форм

Раньше секции анкеты выводились плоско, без визуальной группировки и
прогресса. Сделали:

- Миграция [`20260524_section_header_color.sql`](../../supabase/migrations/20260524_section_header_color.sql)
  — поля `header_color` (опциональный цвет хедера) и `description`
  у секций форм.
- [`FormKitView`](../../src/components/forms/FormKitView.tsx) /
  [`SectionRow`](../../src/components/templates/FormTemplateEditorPage/components/SectionRow.tsx)
  — аккордеон с цветными заголовками и прогресс-баром.
- Новые: [`sectionColors.ts`](../../src/components/forms/sectionColors.ts),
  [`sectionProgress.ts`](../../src/components/forms/sectionProgress.ts),
  [`SectionSettingsDialog`](../../src/components/templates/FormTemplateEditorPage/components/SectionSettingsDialog.tsx).
- Хуки [`useFormSections`](../../src/components/templates/FormTemplateEditorPage/hooks/useFormSections.ts)
  и расширение [`useFormKitData`](../../src/hooks/useFormKitData.ts).

## 3. Разделение `.claude/rules/`

Старый `infrastructure.md` (≈2200 строк) распилен на 4 фокусированных файла:

- [`infrastructure.md`](../../.claude/rules/infrastructure.md) — стек,
  деплой, операции с Supabase, VPS, mtproto-service.
- [`data-model.md`](../../.claude/rules/data-model.md) — модель данных
  и продуктовые фичи (треды, корзина, статусы, календарь, дневник,
  сайдбар, импersonация, фильтры, списки, маркетплейс, роуты).
- [`channels.md`](../../.claude/rules/channels.md) — карантинная зона:
  мессенджер-каналы (TG group/Business/MTProto, Wazzup, Email).
- [`gotchas.md`](../../.claude/rules/gotchas.md) — известные ловушки
  (RLS short-circuit, multi-bot dedup, `--no-verify-jwt`, секреты,
  костыли с upsert).

[`CLAUDE.md`](../../CLAUDE.md) и [`refactoring.md`](../../.claude/rules/refactoring.md)
обновлены под новую структуру: добавлен decision tree «какой файл
читать когда». Архивные документы перенесены в `docs/archive/`.

## Миграции / Edge Functions

- [`20260524_slot_ai_prompts.sql`](../../supabase/migrations/20260524_slot_ai_prompts.sql)
  — применена. Добавлены `ai_naming_prompt`/`ai_check_prompt` на 4 таблицы
  слотов + обновлена RPC `create_document_kit_from_template`.
- [`20260524_section_header_color.sql`](../../supabase/migrations/20260524_section_header_color.sql)
  — применена. Поля цвета и описания секций форм.
- `check-document` — задеплоена с новой логикой иерархии промптов
  (`supabase functions deploy check-document --project-ref zjatohckcpiqmxkmfxbs`).

## Файлы

- Документация: `.claude/rules/{infrastructure,data-model,channels,gotchas,refactoring}.md`,
  `CLAUDE.md`, `docs/archive/README.md`, `docs/changelog/README.md`.
- Слоты/папки: `EditSlotDialog.tsx`, `SlotsEditor.tsx`, `useSlotsEditorMutations.ts`,
  `SlotTemplatePickerDialog.tsx`, `SlotTemplatesContent.tsx`,
  `FolderTemplateDialog.tsx`, `FolderTemplatesContent.tsx`,
  `EditKitFolderDialog.tsx`, `useFolderOperations.ts`, `check-document/index.ts`,
  `src/types/database.ts`.
- Формы: `FormKitView.tsx`, `FieldsGrid.tsx`, `sectionColors.ts`,
  `sectionProgress.ts`, `forms/types.ts`, `FormTemplateEditorPage.tsx`,
  `FieldsTable.tsx`, `FieldsTableContext.tsx`, `SectionRow.tsx`,
  `SectionSettingsDialog.tsx`, `useFormSections.ts`, `useFormKitData.ts`.

## Известные ограничения

- В шаблонах папок и наборов слот-чипы выглядят как в проектных папках
  (янтарная обводка), но визуально не идентичны на пиксель — проектный
  `EmptySlotChip` завязан на контексты `DocumentKitsTab` и не может быть
  напрямую переиспользован. Если потребуется полная пиксельная
  идентичность — нужен рефакторинг с выносом презентационного
  `SlotChipBase` в общий слой.
- Старая lint-ошибка `react-hooks/set-state-in-effect` в
  `FormTemplateEditorPage/components/SectionSettingsDialog.tsx` остаётся
  с момента создания файла (коммит `0132967`). Не блокирует, но висит.
