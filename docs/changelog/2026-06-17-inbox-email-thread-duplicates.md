# Дубли email-тредов во «Входящих» + понятная ошибка дубля email

**Дата:** 2026-06-17
**Тип:** bugfix
**Статус:** completed (БД применена в прод)

---

## Что было

В списке «Входящие» один email-диалог («Илья Гордейко», `info@abcspain.ru`)
показывался несколькими строками; все строки подсвечивались одновременно как
один тред, и «спустя время добавлялся ещё дубль» (на скрине — 6 строк на
3 реальных письма).

### Корень (измерено на проде)

Имя/аватар собеседника email-треда в `get_inbox_threads_v2` резолвился
обычным `LEFT JOIN participants` по `lower(email)` — **единственным** JOIN
участников по email (остальные по `.id`), **без `LIMIT 1`**. В `participants`
оказалось **2 живых записи с одним email**: автосозданная при первом письме
(имя = адрес) и созданная вручную позже («ABC-spain», тот же email, без
дедупа). Email не уникален → каждая строка email-треда множилась надвое
(одна копия с настоящим именем, вторая с именем-адресом), **обе с одним
`thread_id`** → коллизия React-key в списке и одновременная подсветка.
3 треда × 2 контакта = 6 строк. Дубль контакта во всей базе был ровно один.

## Что стало

Фикс в три слоя:

1. **Данные:** дубль-контакты слиты — настоящий переименован в «ABC-spain»,
   пустой дубль-сирота (0 тредов/0 сообщений) помечен `is_deleted=true`.
   Список схлопнулся 6 → 3.
2. **Защита данных от повтора:** partial-unique индекс
   `uq_participants_workspace_email_active` на
   `(workspace_id, lower(email)) WHERE is_deleted=false AND email<>''` —
   создать второй контакт с тем же email больше нельзя.
3. **Защита в запросе:** email-JOIN в `get_inbox_threads_v2` переведён на
   `LEFT JOIN LATERAL (… ORDER BY created_at LIMIT 1)` — максимум 1 контакт
   на адрес, фан-аут невозможен даже при будущих дублях. Сигнатура функции
   не менялась → гранты сохранены (authenticated + service_role, anon нет).

## Понятная ошибка при добавлении участника

Ограничение из п.2 ломало добавление участника с уже существующим email
невнятным тостом «Не удалось добавить участника». Теперь:

- тост **«Этот email уже используется другим участником»** (детект по коду
  PostgreSQL `23505` + имени индекса `uq_participants_workspace_email_active`);
- поле **Email подсвечивается красным** + подпись под ним; подсветка
  сбрасывается при вводе и при повторном открытии диалога.

## Применение

Обе миграции применены в прод через MCP (`apply_migration`). Файлы в репо:
`20260617_participants_email_unique_active.sql`,
`20260617_inbox_v2_email_counterpart_lateral.sql`. Фронт-правки UX —
обычная выкатка (push/CI).

## Файлы

- `supabase/migrations/20260617_participants_email_unique_active.sql`
- `supabase/migrations/20260617_inbox_v2_email_counterpart_lateral.sql`
- `.claude/rules/messenger-ledger.md` (запись в журнал расследований)
- `src/hooks/permissions/useParticipantsMutations.ts` (`isEmailDuplicateError` + тост)
- `src/components/participants/EditParticipantDialog.tsx` (подсветка поля)
- `src/page-components/workspace-settings/ParticipantsTab.tsx` (`mutateAsync`)
