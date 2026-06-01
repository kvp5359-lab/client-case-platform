# Размеры файлов в документах — тег набора, размер выделенных, подсветка по порогам

**Дата:** 2026-06-01
**Тип:** feature
**Статус:** completed

---

## 1. Тег суммарного размера набора документов

**Было:** размеры показывались только у отдельных файлов в строках. Сколько
«весит» весь набор документов — нигде не видно.

**Стало:** в заголовке набора (kit) справа — аккуратный серый тег с суммарным
размером всех файлов набора.

- [`KitDocuments.tsx`](../../src/page-components/ProjectPage/components/Documents/KitDocuments.tsx):
  `totalSize` считается по текущей версии каждого документа
  (`getCurrentDocumentFile`), **только** не удалённые документы и принадлежащие
  папкам этого набора (`kitFolderIds`). Без этого фильтра в сумму попадали
  удалённые из корзины набора и завышали цифру в ~3 раза.

## 2. Размер выделенных файлов в панели массовых действий

**Было:** «Выбрано документов: N» — без объёма.

**Стало:** «Выбрано документов: N (X МБ)» — суммарный размер выделенного, серым.

- [`FloatingBatchActions.tsx`](../../src/components/documents/FloatingBatchActions.tsx):
  новый опциональный проп `selectedSize`, рендер в скобках после счётчика.
- [`useGlobalBatchActions.ts`](../../src/components/projects/DocumentKitsTab/hooks/useGlobalBatchActions.ts):
  `selectedSize` — сумма по текущим версиям выделенных документов.

## 3. Подсветка больших файлов по порогам шаблона проекта

**Было:** все размеры файлов — одинаково серым, большой файл визуально не
выделялся.

**Стало:** тег размера файла окрашивается по двум порогам, заданным **в шаблоне
проекта**: серый (норма) → 🟡 янтарный (≥ жёлтого порога) → 🔴 красный
(≥ красного). Уже сжатые файлы подсвечиваются приглушённо (`text-*-300` без
жирного) — они уже оптимизированы. Пороги независимы, пусто = цвет выключен.

- Миграция
  [`20260601_project_template_file_size_thresholds.sql`](../../supabase/migrations/20260601_project_template_file_size_thresholds.sql)
  (новая, **применена в проде**): колонки `file_size_warn_mb` и
  `file_size_danger_mb` (numeric, nullable) на `project_templates`.
- `src/types/database.ts` + [`types/index.ts`](../../src/page-components/ProjectPage/types/index.ts):
  типы (`Row`/`Insert`/`Update` + `ProjectTemplateWithRelations`).
- [`useProjectData.ts`](../../src/page-components/ProjectPage/hooks/useProjectData.ts):
  два поля добавлены в `select` (хук грузит явный список колонок, не `*`).
- Проброс порогов до строки документа:
  [`ProjectPage.tsx`](../../src/page-components/ProjectPage.tsx) →
  [`ProjectTabsContent.tsx`](../../src/page-components/ProjectPage/components/ProjectTabsContent.tsx) →
  [`DocumentsTabContent.tsx`](../../src/page-components/ProjectPage/components/DocumentsTabContent.tsx) →
  [`useDocumentsProviderProps.ts`](../../src/page-components/ProjectPage/components/Documents/hooks/useDocumentsProviderProps.ts) →
  [`DocumentsContext.tsx`](../../src/page-components/ProjectPage/components/Documents/DocumentsContext.tsx) →
  [`DocumentItem.tsx`](../../src/page-components/ProjectPage/components/Documents/DocumentItem.tsx).
- [`PanelDocumentsContent.tsx`](../../src/components/documents/PanelDocumentsContent.tsx):
  пороги подтягиваются и в TaskPanel → «Документы» (через `useProjectData`).
- [`PlanDocsProvider.tsx`](../../src/components/plan/PlanDocsProvider.tsx):
  передаёт `null` (подсветка в плане не нужна).
- Настройка в редакторе шаблона:
  [`FileSizeThresholdsSection.tsx`](../../src/components/templates/project-template-editor/FileSizeThresholdsSection.tsx)
  (новый) — секция «Подсветка больших файлов» во вкладке «Интеграции»
  ([`ProjectTemplateEditorPage.tsx`](../../src/components/templates/ProjectTemplateEditorPage.tsx)):
  два поля порога в МБ, валидация «красный > жёлтый», пусто = выключено,
  самодостаточная мутация (инвалидирует `detail` + `detailFull`).

## Затронутые файлы

- `supabase/migrations/20260601_project_template_file_size_thresholds.sql` (новый)
- `src/components/templates/project-template-editor/FileSizeThresholdsSection.tsx` (новый)
- `src/page-components/ProjectPage/components/Documents/KitDocuments.tsx`
- `src/page-components/ProjectPage/components/Documents/DocumentItem.tsx`
- `src/page-components/ProjectPage/components/Documents/DocumentsContext.tsx`
- `src/page-components/ProjectPage/components/Documents/hooks/useDocumentsProviderProps.ts`
- `src/page-components/ProjectPage/components/DocumentsTabContent.tsx`
- `src/page-components/ProjectPage/components/ProjectTabsContent.tsx`
- `src/page-components/ProjectPage.tsx`
- `src/page-components/ProjectPage/hooks/useProjectData.ts`
- `src/page-components/ProjectPage/types/index.ts`
- `src/components/documents/FloatingBatchActions.tsx`
- `src/components/documents/PanelDocumentsContent.tsx`
- `src/components/projects/DocumentKitsTab/hooks/useGlobalBatchActions.ts`
- `src/components/plan/PlanDocsProvider.tsx`
- `src/components/templates/ProjectTemplateEditorPage.tsx`
- `src/types/database.ts`

## Проверки

- `npm run lint && npx tsc --noEmit && npm test` — зелёные (lint 0, tsc 0, 667 тестов).
- Миграция применена в проде.
