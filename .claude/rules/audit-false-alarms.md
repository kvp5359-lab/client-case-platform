# Ложные тревоги аудита

Места, которые **выглядят** как баги/дубли/legacy, но на самом деле — by design. Записаны чтобы будущий аудитор не тратил часы на их «починку».

При полном аудите — **сверяться с этим файлом** перед формулировкой претензии. Если претензия совпадает с записью ниже — пропускать.

---

## 1. Edge Functions: `getCorsHeaders` ≠ legacy

**Ложный сигнал:** «26+ функций используют legacy CORS из `_shared/cors.ts`».

**Реальность:** `getCorsHeaders(req)` из `_shared/cors.ts` — это правильная **базовая** функция с динамическим Origin-whitelist. Это НЕ legacy.

Legacy паттерн — это:
- объект `corsHeaders` (статический wildcard `*`) — удалён 2026-05-24;
- хардкод `'Access-Control-Allow-Origin': '*'` в самом файле — было только в `sandbox-test`, исправлено 2026-05-24.

Все остальные функции 2026-05-24 мигрированы на `corsHeadersFor(req)` из `_shared/edge.ts` (супер-обёртка над `getCorsHeaders` с `x-internal-secret` в Allow-Headers).

**Что не считать тревогой:**
- `const corsHeaders = getCorsHeaders(req)` — локальная переменная с динамическим CORS, всё ок.
- `corsHeadersFor(req)` — это и есть текущий канонический способ.

---

## 2. STAFF_ROLES / TEAM_ROLES — 4 определения by design

**Ложный сигнал:** «Дубликация — 4 разных списка ролей сотрудников в разных файлах».

**Реальность:** все 4 — разные сущности с разной семантикой. Список **специально** не унифицирован.

| Файл | Что это |
|------|---------|
| `src/types/permissions.ts` → `STAFF_ROLES` | Канон. `['Владелец', 'Администратор', 'Сотрудник', 'Исполнитель']`. Для фильтра «кому назначить задачу». **Включает project-роль «Исполнитель»**. |
| `src/components/messenger/chatSettingsTypes.ts` → `STAFF_ROLES` | Только **workspace-роли** `['Владелец', 'Администратор', 'Сотрудник']`. Для классификации участника чата в 4 группы (staff/external/client/other). «Исполнитель» — project-роль, поэтому **намеренно не входит**. |
| `src/page-components/workspace-settings/IntegrationsTab/types.ts` → `TEAM_ROLES` | `['Владелец', 'Администратор', 'Сотрудник', 'Внешний сотрудник']`. Для фильтра «кому можно дать персонального бота». Включает «Внешний сотрудник» (внешние сотрудники тоже работают на стороне сервиса, не клиент). Исполнитель здесь не нужен — это workspace-фильтр. |
| `src/components/messenger/MessageBubble.tsx` → `isTeamSender` | Импортирует `isStaffRole` из `permissions.ts`. Унифицирован 2026-05-24. |

**Если хочется унифицировать** — это поломает поведение. Разрешено только трогать после ручного анализа каждого места использования.

---

## 3. RLS short-circuit `created_by` — **больше не нужен**

**Ложный сигнал:** «Полиция `project_threads_select` обязана содержать `created_by = auth.uid()` OR — иначе INSERT...RETURNING ломается».

**Реальность:** до 2026-05-24 — да. После применения миграции `20260524_can_user_access_thread_row_overload.sql` — **уже нет**. Функция переписана на row-overload `can_user_access_thread(t project_threads, p_user_id uuid)`, перечитывания таблицы нет, INSERT...RETURNING работает.

**Если увидишь предложение «верни short-circuit»** — отказать. Это устаревший рецепт. Подробно — в `gotchas.md` раздел «RLS на project_threads — закрыто 2026-05-24».

---

## 4. Старая сигнатура `can_user_access_thread(uuid, uuid)` — не мёртвая

**Ложный сигнал:** «После 2026-05-24 старая сигнатура `can_user_access_thread(uuid, uuid)` — мёртвая, можно удалить».

**Реальность:** её используют **8 политик** на смежных таблицах (`message_attachments`, `message_reactions`, `message_translations`, `project_messages` SELECT/UPDATE/DELETE, `project_threads` UPDATE/DELETE). Там нет проблемы перечитывания (строки уже существуют). Удаление сломает доступ к сообщениям.

Проверь через:
```sql
SELECT polname FROM pg_policy
WHERE pg_get_expr(polqual, polrelid) LIKE '%can_user_access_thread(%, %';
```

---

## 5. Realtime подписки — утечек нет

**Ложный сигнал:** «`supabase.channel(...)` может протекать без `removeChannel`».

**Реальность (на 2026-05-24):** все 7 хуков с realtime подписками имеют корректный cleanup:
- `useTelegramLink.ts`, `useProjectMessages.ts`, `useNewMessageToast.ts`, `useThreadAuditEvents.ts`, `useTypingIndicator.ts`, `useSendFailures.ts`, `useWorkspaceMessagesRealtime.ts`.

Проверка одной командой:
```bash
for f in $(grep -rln "\.channel(" src/hooks); do
  echo "$f: ch=$(grep -c '\.channel(' $f) rm=$(grep -c 'removeChannel' $f)"
done
```

---

## 6. `react-hook-form` и `zod` в `package.json` — не используются

**Ложный сигнал:** «Зависимости `react-hook-form` и `zod` — кандидаты на удаление, ни одна форма их не использует».

**Реальность:** by design. Документировано в `gotchas.md`. Все формы — на нативном `useState`. Зависимости остались исторически от `shadcn init` и могут понадобиться при добавлении валидаторов. Удалять не надо — `npm` их не тянет в продакшен-бандл (tree-shaking).

---

## 7. `MessageChannel` enum ≠ «клиентский тред»

**Ложный сигнал:** «`MessageChannel = 'client' | 'internal'` — это сигнал, что тред клиентский».

**Реальность:** легаси-разделение для `project_messages`, не для тредов. Task-треды по умолчанию `channel='client'`, но клиентскими **не являются**. Для определения «клиентский тред» — см. `channels.md` → раздел про подсветку сообщений сотрудников.

---

## 8. Формы — не нужен `react-hook-form` и `zod`

См. пункт 6.

---

## 9. `project_template_tasks` — давно дропнута

**Ложный сигнал:** «Где-то в коде ещё ссылка на `project_template_tasks`».

**Реальность:** таблица дропнута 2026-04-11. Все упоминания в коде — комментарии и changelog, **игнорируй их**. Все задачи живут в `thread_templates`.

---

## 10. `task_panel_tabs` upsert через ручной SELECT+UPDATE — это не баг

**Ложный сигнал:** «Странный костыль с ручным SELECT id → UPDATE по id или INSERT в `useTaskPanelTabs.ts upsertMutation`».

**Реальность:** обязательный костыль — partial UNIQUE constraints не поддерживаются `.upsert({ onConflict: ... })` в PostgREST (42P10). Документировано в `gotchas.md`.

---

## 11. Большие файлы 400-450 строк — оркестраторы, не дробить

**Ложный сигнал:** «Файл BoardView.tsx (411 строк) / BoardListCalendarView.tsx (435 строк) — кандидаты на распил».

**Реальность:** уже распилены до разумного минимума (изначальные размеры 775 и 948). Оставшееся — связные хэндлеры `@dnd-kit` и `react-big-calendar`, зависят от того же стейта (view, date, refs, activeCard, lists). Дальше дробить = пробрасывать 5+ параметров между мелкими файлами.

**Правило**: 400-450 строк для главного контроллера сложной фичи — нормально.

---

## Как добавлять новые записи

Когда аудитор находит «проблему», которая после расследования оказалась by design — добавь запись сюда с:
1. Заголовком «Ложный сигнал».
2. Тем что показалось проблемой.
3. Почему это не проблема (с указанием файла/миграции/даты).
4. Что **не считать** тревогой в этой области.
