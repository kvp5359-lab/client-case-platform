# Сайдбар: тень активного проекта, фикс favicon-бейджа

**Дата:** 2026-04-05
**Тип:** ui, fix
**Статус:** completed

---

## Что сделано

### Тень вокруг активного проекта в сайдбаре
- `src/components/WorkspaceSidebar/ProjectListItem.tsx` — у рамки активного проекта с раскрытыми вкладками появилась мягкая равномерная тень со всех сторон (`shadow-[0_0_8px_rgba(0,0,0,0.12)]`)
- `transition-all` вместо `transition-colors` — тень плавно появляется/исчезает вместе с рамкой
- `src/components/WorkspaceSidebar/ProjectsList.tsx` — добавлены `px-1 -mx-1` у списка проектов, чтобы тень не обрезалась `overflow-y-auto` контейнера

### Починен favicon-бейдж с количеством непрочитанных
- `src/hooks/messenger/useFaviconBadge.ts` — хук перестал модифицировать Next.js-генерируемый `<link rel="icon">`, потому что Next.js его перезаписывал и бейдж не появлялся во вкладке
- Теперь хук создаёт и управляет собственным `<link id="dynamic-favicon">`, а Next.js-теги удаляются
- Возврат к `/favicon.ico` вместо несуществующего `/favicon.svg`, который был ошибкой
