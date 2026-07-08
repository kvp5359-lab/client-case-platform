---
id: 2026-07-08-project-tasks-errorboundary-crash
title: Краш экрана «Задачи» проекта (ErrorBoundary) в проде — стек не виден из-за проводки логгера
status: open
severity: medium
area: ProjectPage, tasks, ErrorBoundary, sentry, logger
first-seen: 2026-07-08 12:48 UTC (Sentry issue 62e4ddb502ee45e198a75f075039220c)
last-investigated: 2026-07-08
---

## Что было

Sentry-алерт с прода `rs.clientcase.app`:

- Issue: **[ErrorBoundary]** на `/workspaces/:workspaceId/projects/:projectId`
- URL: `https://rs.clientcase.app/projects/147?tab=tasks`
- environment: production, level: error
- Chrome 149 / Windows, 2026-07-08 12:48:57 UTC
- ID: `62e4ddb502ee45e198a75f075039220c`

React-компонент упал на **вкладке «Задачи»** проекта → сработал `ErrorBoundary`
([src/components/ErrorBoundary.tsx](../../../src/components/ErrorBoundary.tsx)),
юзер увидел фолбэк ошибки вместо списка задач.

## Проект

`short_id=147` = **«Ekaterina Soskovets»** (`970502d3-…`, ws `8a946780`): живой,
14 тредов, 0 plan_blocks. Явных аномалий не видно.

## Почему не видно, ЧТО упало (важно)

`ErrorBoundary.componentDidCatch` звал `logger.error('[ErrorBoundary]', error)`,
а `logger.error` до фикса брал **первый** аргумент как ошибку. Первым была строка
`'[ErrorBoundary]'` → уходило в `Sentry.captureMessage('[ErrorBoundary]')`, а сам
`error` (со стеком) прятался в `extra`. Итог: **все** ErrorBoundary-краши
сваливались в одно issue без стека → корневую причину по алерту не установить.

## Сделано в этой сессии (частично)

- `logger.error` переписан: ищет настоящую `Error` среди аргументов и шлёт её как
  `captureException` (стек + группировка), строку-префикс кладёт в контекст
  ([src/utils/logger.ts](../../../src/utils/logger.ts)).
- `ErrorBoundary` теперь передаёт `error` первым + `componentStack` в контекст
  ([src/components/ErrorBoundary.tsx](../../../src/components/ErrorBoundary.tsx)).

⏳ **Ещё не задеплоено на прод** (в очереди коммитов). До деплоя новые краши
по-прежнему без стека.

## Что НЕ сделано / следующий шаг

- **Корневую причину ЭТОГО краша (147, tab=tasks) установить нельзя** — стек
  потерян старой проводкой. Ждём **следующего** такого краша уже с исправленным
  логгером → в Sentry будет реальный тип ошибки + componentStack → чинить точечно.
- Гипотезы (не проверены): битые данные одной из 14 задач (null-поле статуса/срока),
  edge-case рендера строки задачи, либо падение при `tab=tasks` конкретно.

## Файлы

- `src/components/ErrorBoundary.tsx`, `src/utils/logger.ts`
- `src/page-components/ProjectPage.tsx` (обёрнут ErrorBoundary), `src/components/tasks/*`
