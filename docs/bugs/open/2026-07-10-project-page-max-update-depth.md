---
id: 2026-07-10-project-page-max-update-depth
title: «Maximum update depth exceeded» на странице проекта (бесконечный цикл setState)
status: open
severity: medium
area: ProjectPage, react, render-loop, sentry
first-seen: 2026-07-10
last-investigated: 2026-07-10
---

## Симптом

Sentry issue `JAVASCRIPT-NEXTJS-E`, event `05d060557eee407c86868e4e6aab97dd`:

```
Error: Maximum update depth exceeded. This can happen when a component
repeatedly calls setState inside componentWillUpdate or componentDidUpdate.
React limits the number of nested updates to prevent infinite loops.
  at rh (chunks/0rwwge57xnfls.js:1:35839)
  at rd (chunks/0rwwge57xnfls.js:1:35363)
  at oy (chunks/0rwwge57xnfls.js:1:68230)
  at ov (chunks/0rwwge57xnfls.js:1:67833)
  at i  (chunks/0gjbemrhv0ov5.js:1:19730)
  ... (45 more frames)
```

- URL: `https://rs.clientcase.app/projects/40`
- transaction: `/workspaces/:workspaceId/projects/:projectId`
- 2026-07-10 11:50 UTC, production, Chrome 150 / Windows, `handled=yes`, `level=error`, `mechanism=generic`, тег `turbopack=True`.

## Природа

Реальный баг (НЕ транзиентный шум): какой-то компонент на странице проекта
вызывает `setState` в цикле — типично `setState` прямо в теле рендера, либо
`useEffect` со `setState` и нестабильной зависимостью (новый объект/массив/функция
каждый рендер), либо паттерн «adjust state on prop change» с условием, которое
всегда истинно. React обрывает цикл и кидает ошибку → у пользователя страница
проекта могла подвиснуть/подтормаживать. `handled=yes` — поймано ErrorBoundary/
логгером, но UX деградировал.

**НЕ от групп задач** — та фича (ProjectFlatPlanList и пр.) на момент бага НЕ в
проде (коммиты не запушены). Баг существует в текущем боевом коде.

## Блокер расследования

Стек **минифицирован** (`rh/rd/oy/ov/i`) — sourcemaps в Sentry отключены
(`next.config.ts:48` → `sourcemaps: { disable: true }`). Без них точный
файл/компонент/строку не вытащить, только гадать по множеству `useEffect` на
ProjectPage. Тот же блокер у краша «Задачи»
([2026-07-08-project-tasks-errorboundary-crash](2026-07-08-project-tasks-errorboundary-crash.md)).

## Что делать

1. **Включить загрузку sourcemaps в Sentry** (стратегическое, чинит и этот баг, и
   краш-147, и все будущие): создать Sentry auth-token → `SENTRY_AUTH_TOKEN` в
   GitHub Actions secret → в `next.config.ts` убрать `sourcemaps.disable` +
   передать `authToken`. Тогда Sentry покажет реальные имена/строки.
2. **ИЛИ воспроизвести** `/projects/40` локально (dev и prod на одной БД →
   проект существует): открыть страницу, поймать в консоли «Maximum update depth»,
   React DevTools Profiler / «Highlight updates» покажет зацикленный компонент.
3. После локализации — точечный фикс (стабилизировать зависимость `useEffect` /
   убрать `setState` из рендера / поправить условие sync-on-prop).

## Файлы (кандидаты, до локализации)

- `src/page-components/ProjectPage.tsx` + `src/page-components/ProjectPage/hooks/*`
- `next.config.ts` (sourcemaps)
