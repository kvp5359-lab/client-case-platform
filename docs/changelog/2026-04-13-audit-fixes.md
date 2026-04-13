# Исправления по аудиту 2026-04-12 — 2026-04-13

**Дата:** 2026-04-13
**Тип:** fix
**Статус:** completed

---

## Что сделано

Полный аудит 10 зон рефакторинга (2026-04-12) выявил 3 средних и 8 низких проблем. Ниже — исправленные.

### 🟠 DROP мёртвой RPC `get_workspace_tasks(uuid)`

- **Проблема:** функция осталась в БД после перехода на `get_workspace_threads(uuid, uuid)`. Код больше её не вызывает, но внутри не было фильтра `p.is_deleted = false` — при ручном вызове утекали задачи из удалённых проектов.
- **Решение:** миграция `supabase/migrations/20260413_drop_dead_get_workspace_tasks.sql` — `DROP FUNCTION IF EXISTS`.

### 🟠 RLS на маркетплейс-таблицах

- **Проблема:** 10 таблиц маркетплейса (service_categories, lawyer_profiles, orders, payments и т.д.) создавались без `ENABLE ROW LEVEL SECURITY`. Миграция не применена (заготовка), но при будущем применении таблицы были бы открыты по умолчанию.
- **Решение:** добавлен `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` на все 10 таблиц в `supabase/migrations/20260404_marketplace_tables.sql`. Без политик = deny all.

### 🟠 Hardcoded query keys → фабрики из queryKeys.ts

- **Проблема:** 3 места в коде использовали строковые массивы вместо фабрик — при переименовании ключей инвалидация могла молча сломаться.
- **Файлы:**
  - `src/components/templates/project-template-editor/useProjectTemplateData.ts` — `['knowledge-articles', ...]` → `knowledgeListKeys.articlesList()`, `['knowledge-groups', ...]` → `knowledgeBaseKeys.groups()`
  - `src/page-components/ProjectsPage.tsx` — hardcoded массив → `projectKeys.listForUser()`, удалён TODO-комментарий

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `supabase/migrations/20260413_drop_dead_get_workspace_tasks.sql` | Новый — DROP мёртвой RPC |
| `supabase/migrations/20260404_marketplace_tables.sql` | + RLS на 10 таблиц |
| `src/components/templates/.../useProjectTemplateData.ts` | query keys → фабрики |
| `src/page-components/ProjectsPage.tsx` | query key → фабрика |
