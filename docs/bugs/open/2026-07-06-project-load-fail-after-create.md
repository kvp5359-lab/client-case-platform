---
id: 2026-07-06-project-load-fail-after-create
title: «Не удалось загрузить проект» сразу после создания проекта (разовая гонка, Sentry)
status: open
severity: low
area: ProjectContext, project-load, create-project, race
first-seen: 2026-07-06 14:13 UTC (Sentry issue a99b8ed5e866467fb067a8ecd711bf05)
last-investigated: 2026-07-06
---

## Что было

Sentry прислал алерт с прода `rs.clientcase.app`:

- Issue: **«Не удалось загрузить проект:»** (JAVASCRIPT-NEXTJS-3)
- URL: `https://rs.clientcase.app/projects/238?panelTab=assistant`
- environment: production, level: error
- Chrome 149 / Windows, 2026-07-06 14:13:28 UTC
- ID: `a99b8ed5e866467fb067a8ecd711bf05`

## Ключевая зацепка (по замеру в БД)

Проект `short_id=238` = **«Relomania»** (`ecca0dfb-8969-4490-b8b4-354030b3b410`, ws `8a946780`):
- **не удалён**, доступ есть, **сейчас открывается нормально**;
- **создан `14:13:05` UTC**, ошибка — **`14:13:28`**, то есть **через 23 секунды после создания**;
- в URL `panelTab=assistant` — открывалась вкладка AI-ассистента.

## Гипотеза (не подтверждена окончательно)

**Разовая гонка при создании проекта.** Сразу после «Создать» приложение перешло на `/projects/238`, и запрос данных проекта (`ProjectContext`, [src/contexts/ProjectContext.tsx:78-95](../../../src/contexts/ProjectContext.tsx)) на миг опередил готовность строки: сетевой хиккап ИЛИ RLS-видимость только что вставленной строки под snapshot'ом. Отсюда `queryError` → `logger.error('Не удалось загрузить проект', …)` → Sentry.

Источник текста: `ProjectContext` (fallback-строка) + `projectService.ts:17` (safeFetchOrThrow). Внутри — `if (!data) throw 'Проект не найден или нет доступа'`.

## Отвергнуто

- ✗ «проект удалён / нет доступа» — проект живой, `is_deleted=false`, доступ есть.
- ✗ «постоянный баг загрузки» — проект открывается нормально; ошибка разовая.

## Почему low / отложено

Разовый случай, проект существует и грузится. Реагировать срочно не нужно.

## Триггер к действию

Если **повторится именно при создании проектов** (паттерн: падает через несколько секунд после «Создать»/`panelTab=assistant`) — чинить гонку:
- мягкий ретрай запроса проекта в `ProjectContext` (React Query `retry` на транзиентных),
- либо дождаться готовности проекта перед `router.push` на `/projects/<id>`,
- проверить, не падает ли на самом деле загрузка вкладки **ассистента** (`panelTab=assistant`), а не самого проекта.

## Файлы

- `src/contexts/ProjectContext.tsx` (загрузка проекта + текст ошибки)
- `src/services/api/projectService.ts` (safeFetchOrThrow → тот же текст)
