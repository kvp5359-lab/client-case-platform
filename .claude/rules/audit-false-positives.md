# Аудит-агенты — известные ложные тревоги

Когда новый агент проходит код по зонам из [`refactoring.md`](./refactoring.md),
он часто «находит» проблемы, которые на самом деле не баги. Этот файл —
список таких типовых ложных тревог, чтобы не тратить время на их разбор
снова.

**Если агент аудита нашёл что-то из списка — это не репорт, это ложь.**

Файл живой: при разборе очередной ложной тревоги добавлять сюда.

---

## React Query

### `accessibleProjectKeys.all` не покрывает `accessibleProjectKeys.workspace(id)`

**Ложно.** Покрывает. `all = ['accessible-projects']` — broad-prefix,
React Query использует partial matching: инвалидация `all` сбросит все
ключи вида `['accessible-projects', ...]`. Проверять не «такой же ли
ключ возвращается», а «совпадает ли префикс».

Это касается **всех `*Keys.all`** в [`src/hooks/queryKeys/`](../../src/hooks/queryKeys/) —
они задуманы как prefix'ы для broad-invalidate.

### Soft-delete-хук «не инвалидирует trash-кеш»

Часто ложно. `useDeleteContextItem`, `useSoftDelete*` обычно принимают
`workspaceId` параметром, и условно (`if (workspaceId) qc.invalidate(...)`)
дёргают `byWorkspaceTrash`. Перед репортом — проверить наличие условной
ветки в `onSuccess`.

### Литерал в queryKey — иногда намеренный broad-match

`queryClient.invalidateQueries({ queryKey: ['sidebar', 'projects'] })` —
без `workspaceId` — может быть **осознанным** broad-prefix'ом во ВСЕХ
воркспейсах. Перед репортом проверить, есть ли в хуке доступ к
`workspaceId` (если есть — фиксим, если нет — фиксируем как именованный
префикс типа `sidebarKeys.projectsAll`).

---

## Типы

### `MessageChannel` enum «не сигнал клиентского треда»

Уже задокументировано в [`channels.md`](./channels.md#подсветка-сообщений-сотрудников-в-клиентских-чатах)
и [`gotchas.md`](./gotchas.md#messagechannel-enum--не-сигнал-клиентского-треда).
Не предлагать «починить» путаницу — это by design (легаси
`project_messages`).

### Локальные enum-типы «не синхронизированы с БД»

Часто ложно. Если фронт-тип — это **строгий union** (`'blue' | 'slate' | ...`),
а в БД колонка `string` — это намеренное type-tightening. Союз —
подмножество всех возможных строк, TypeScript принимает.

Конкретно:
- `ThreadAccentColor` (10 значений) vs `accent_color: string` в БД — не баг.
- `ProjectThread.type: 'chat' | 'task'` vs БД `string` — не баг, БД
  валидирует CHECK constraint'ом.

Признак реального бага: код использует `as never` или `as unknown` для
обхода type-error. Тогда либо расширить тип, либо привести через
осмысленный union (см. `TaskDialog.tsx:209` — паттерн `as ThreadAccentColor`).

### «Дубликат типа `ProjectThread`»

Тип определён **один раз** в [`useProjectThreads.types.ts`](../../src/hooks/messenger/useProjectThreads.types.ts).
Если агент пишет про «два определения» — он путает определение типа с
его использованием в `database.ts`. БД-типы сгенерированы автоматически,
фронт-тип — ручной, расширенный union'ами. Это не дубликат.

---

## Модули проекта / права

### `ai_chat` модуль «не проверяет `enabled_modules`»

Ложно. В [`useProjectModules.ts:80-84`](../../src/page-components/ProjectPage/hooks/useProjectModules.ts:80)
честно проверяются все три слоя:

```ts
enabledModules.includes('ai_chat')
  && (hasModuleAccess('a') || hasModuleAccess('b') || hasModuleAccess('c'))
  && isFeatureEnabled('ai_chat_assistant')
```

Особенность: `ai_chat` не в реестре `PROJECT_MODULES` потому, что у
него **OR трёх permission keys**, а `ModuleDefinition` поддерживает
только один `permissionKey`. Это намеренно — не «техдолг».

### `module_access` не синхронизируется с `enabled_modules`

Ложно. Уже задокументировано в [`gotchas.md`](./gotchas.md#participantsmodule_access-не-синхронизируется-с-enabled_modules)
и [`data-model.md`](./data-model.md#права-доступа-к-модулям-проекта).
Это **by design** — чтобы не терять настройку при временном отключении
модуля в шаблоне.

---

## Документация / репо-гигиена

### `*.tsbuildinfo` «не в .gitignore»

Ложно. В [`.gitignore:42`](../../.gitignore:42) стоит `*.tsbuildinfo`
(broad pattern) — это покрывает и `tsconfig.tsbuildinfo`, и любые
другие. Не нужно добавлять конкретное имя файла.

### Закомментированный код в `permissions.ts` / `sidePanelStore.test.ts`

Ложно. Это:
- В [`permissions.ts`](../../src/types/permissions.ts) — inline-комментарии
  у enum-значений (`'manage_workspace_settings' // Редактировать ...`).
- В [`sidePanelStore.test.ts`](../../src/store/sidePanelStore.test.ts) —
  section-разделители (`// ━━━ Открытие / закрытие ━━━`, `// ====`).

Это документация структуры, не мёртвый код.

### «5 таблиц без `IF NOT EXISTS`»

Ложно как репорт для зоны БД. Это **карантинные миграции** (Telegram,
Wazzup) — создаются впервые. `IF NOT EXISTS` имеет смысл только для
повторяемых миграций. Карантин аудит не трогает.

### Версия Next.js «не точная в `infrastructure.md`»

Игнорировать. В [`infrastructure.md`](./infrastructure.md) указывается
**мажор-минор** (`16.x`), не конкретный патч (`16.2.3`) — это
осознанно, чтобы не править доку при каждом `npm update`.

---

## Производительность

### «Большой файл = плохой файл»

Не всегда. Файлы 450-700 строк часто **оркестраторы** — собирают
несколько подкомпонентов и хуки. Это норма, не техдолг.

Реальные кандидаты на распил — те, где **смешана логика и UI** (много
`useEffect`/`useMemo` непосредственно в теле компонента). Признак —
тело функции до `return` больше 50 строк.

### inline-функции в `.map()` «дают лишние ре-рендеры»

Часто ложно. В большинстве мест список рендерится один раз на смену
данных — ре-рендер строки и так неизбежен. inline `onClick={...}` —
проблема только в hot path с десятками тысяч элементов.

---

## Что считается **реальной** находкой

| Признак | Почему серьёзно |
|---------|----------------|
| `as never`, `as unknown as X` без комментария | Маскирует TypeScript-ошибку |
| `@ts-ignore` без причины | То же |
| Хук с подпиской на realtime без `removeChannel` в cleanup | Утечка памяти |
| Таймер/listener без `clearTimeout` / `removeEventListener` | Утечка |
| Дубликат определения **значения** (константы, функции) | Реальное расхождение |
| Layout без server-side guard на приватной зоне | Информационный leak |
| Серверный запрос внутри компонента без `enabled` гейта по обязательным id | Лишние запросы |

Эти — репортить.
