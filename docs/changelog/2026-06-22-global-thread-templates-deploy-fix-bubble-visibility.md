# Глобальные шаблоны тредов + фикс blue/green деплоя + цвет бабла по видимости

**Дата:** 2026-06-22
**Тип:** feature + infra + UX
**Статус:** completed (БД глобальных шаблонов в проде; фронт ждёт деплоя CI)

---

Сборный релиз: три независимых блока, отдельные коммиты, один пуш.

## 1. Глобальные шаблоны тредов (модель «как статусы»)

Шаблон треда стал сущностью **уровня воркспейса** (общая библиотека), а
пер-проектные настройки переехали в junction — по образцу
`project_template_statuses`.

- **Новая таблица `project_template_thread_templates`** (м-к-м
  `project_templates` ↔ `thread_templates`): `sort_order`, `default_status_id`,
  `on_complete_set_project_status_id` — пер-проектные. +RLS (2 политики),
  индексы.
- **Снапшот-колонка `project_threads.on_complete_set_project_status_id`** —
  правило автоперехода статуса проекта хранится в самой строке треда
  (рантайм проектов отвязан от шаблонов). Триггер `auto_advance_project_status`
  переучен читать снапшот, а не джойнить `thread_templates`.
- **Дедуп:** owner-scoped шаблоны схлопнуты по «телу» → 15 глобальных
  (`owner_project_template_id = NULL`), junction заполнен (26 строк).
  Additive — ни одной записи не удалено; неканонические копии остаются (на них
  ссылаются `project_threads.source_template_id` живых проектов). Физическая
  чистка — отдельной миграцией позже.
- **Идемпотентность:** `INSERT ... ON CONFLICT DO NOTHING`, повторный промоут —
  no-op.

**Миграции (обе применены в проде через MCP):**
`20260622_global_thread_templates_junction.sql`,
`20260622_global_thread_templates_dedup.sql`.

**Фронт:** [`ThreadTemplatesContent.tsx`](../../src/components/templates/ThreadTemplatesContent.tsx),
[`ProjectTemplateThreadList.tsx`](../../src/components/templates/project-template-editor/ProjectTemplateThreadList.tsx),
[`useProjectTemplateThreadListMutations.ts`](../../src/components/templates/project-template-editor/useProjectTemplateThreadListMutations.ts),
[`useThreadTemplates.ts`](../../src/hooks/messenger/useThreadTemplates.ts),
[`ProjectTemplateEditorPage.tsx`](../../src/page-components/ProjectTemplateEditorPage.tsx),
[`createProjectFromTemplate.ts`](../../src/services/projects/createProjectFromTemplate.ts),
[`QuickActionsEditor.tsx`](../../src/page-components/workspace-settings/SidebarSettings/QuickActionsEditor.tsx),
[`types/database.ts`](../../src/types/database.ts) (+типы junction).

## 2. Фикс blue/green деплоя — `docker compose exec` съедал stdin

**Инцидент 2026-06-22:** деплой завершался кодом 0 («успех»), но трафик
оставался на старом цвете.

**Корень:** скрипт подаётся в `bash -s` через stdin (`ssh ... < deploy-vps.sh`).
`docker compose exec -T nginx ...` без перенаправления **читает остаток stdin**
и «съедает» хвост скрипта → `nginx -s reload`, гашение старого цвета, prune и
финальный health-curl не выполнялись.

**Фикс:** `</dev/null` всем `docker compose exec` в
[`scripts/deploy-vps.sh`](../../scripts/deploy-vps.sh) — отвязали stdin.

## 3. Цвет бабла по видимости — подсказка отправителю

Раскраска по `visibility` (Фаза 2) теперь видна **только у своих сообщений** и
служит подсказкой отправителю, куда ушло сообщение:

- **Своё:** Всем/клиенту → акцент чата; **Команде** (внутреннее) → чёрный;
  **Заметка** → серый + 🔕; **Только я** → жёлтый + 🔒.
- **Входящие — всегда обычные** (акцент чата), без серого/жёлтого фона и иконок:
  получателю видимость не важна, он просто читает сообщение.

Раньше team/note красили бабл и у входящих → сообщения коллеги во внутреннем
треде выглядели темнее. Теперь маркер видимости — приватная подсказка автора.

**Файл:** [`MessageBubble.tsx`](../../src/components/messenger/MessageBubble.tsx).

## Известные ограничения

- Блоки 1 и 2 реализованы вне этой сессии (параллельная работа); здесь
  закоммичены и описаны. Глубокого аудита фичи глобальных шаблонов не
  проводилось — проверено, что компилируется и миграции в проде.
- Чистка старых owner-scoped `thread_templates` без ссылок — отдельной
  миграцией позже (по плану в шапке junction-миграции).
