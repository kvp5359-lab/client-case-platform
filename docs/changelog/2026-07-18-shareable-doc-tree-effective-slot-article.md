# 2026-07-18 — Молния: ссылки на слоты с унаследованной статьёй + промпты слота из справочника

## Проблема

После введения `folder_slots.slot_template_id` (обратная ссылка на справочник
`slot_templates`) у слотов проекта стала отображаться унаследованная статья, но
кнопка «молния» в композере сообщений **не подставляла ссылку** на такие слоты.

**Корень:** RPC `get_project_shareable_resources` в секции дерева документов
отдавал `article_id = folder_slots.knowledge_article_id` (у слота проекта он
NULL — статья живёт на шаблоне слота). Фронт (`ShareLinksTab.ensureToken`)
создаёт токен только при наличии `article_id` → NULL → ссылка не вставлялась.

## Что сделано

1. **RPC `get_project_shareable_resources`** — слоты дерева документов резолвят
   **эффективную** статью: `coalesce(folder_slots.knowledge_article_id,
   slot_templates.knowledge_article_id)`. Затронуты обе точки — сортировочный
   CTE `fold` и jsonb-сборка слота (`article_id` + lateral для токена).
   Резолв статьи **папки** не менялся. Токен фронт создаёт по требованию
   (`ensureArticleShareLink`), поэтому правки фронта не потребовалось.
   Миграция `20260718210000_shareable_doc_tree_effective_slot_article.sql`
   (тело снято с прода, применено ранее через MCP; секретов в функции нет).

2. **Edge `check-document`** — AI-промпты слота (`ai_naming_prompt`/
   `ai_check_prompt`) теперь резолвятся из справочника тем же паттерном:
   иерархия стала **слот → шаблон слота (справочник) → папка → дефолт
   воркспейса** (`slot.x ?? slot_template.x ?? folder.x ?? workspace.default`).
   Раньше промпты справочника до проверки документа не доходили.

## Проверка

- RPC (данные, проект f6230f7d, набор «БИЗНЕС-ПЛАНА»): «Резюме» → article_id
  `7b956408`, «Банковская выписка» → `d378b1d5` (`will_insert_link=true`);
  слоты без статьи → NULL (текст, корректно).
- `tsc` 0, `eslint` (изменённые файлы) 0. `deno check check-document` — 4
  пред-существующие strict-null (`document`/`user` possibly null), мои строки чисты.
- Эталон дрейфа `schema-manifest.json` обновлён под новое тело RPC.

## Грабли

- Молния строит ссылку только когда RPC отдал `article_id`. Любой слот с
  унаследованной (не локальной) статьёй обязан резолвиться через
  `slot_template_id` — не полагаться на локальный `knowledge_article_id`.
- `check-document` — деплой отдельно (edge), не входит в фронт-сборку.
