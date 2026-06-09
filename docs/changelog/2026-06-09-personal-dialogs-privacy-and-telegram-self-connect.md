# Личные диалоги: приватность, передача, точка отсчёта непрочитанного + само-подключение Telegram

**Дата:** 2026-06-09
**Тип:** feat + fix
**Статус:** completed

Серия связанных правок вокруг личных диалогов сотрудников (Wazzup / Telegram
Business / MTProto) и механики «непрочитанного». Триггер — наблюдение владельца:
сообщения чужого Wazzup-канала падали ему, он видел уведомления и непрочитанное
по чужим перепискам, а сотрудник не мог подключить свой личный Telegram.

---

## 1. Блок «Канал» + передача диалога сотруднику

**Проблема.** В настройках личного Wazzup-диалога не было видно, что это за
канал (только бледная иконка), а сменить ответственного было нельзя. Корень
жалобы «сообщения приходят мне, хотя канал привязан Анне»: webhook берёт
`owner_user_id` только при создании треда — смена сотрудника у канала не
переназначает уже существующие диалоги (by design жёсткой связки канал↔тред).

**Решение.** В диалоге настроек личного диалога вместо кнопки «Подключить канал»
— блок «Канал»: тип (WhatsApp/Instagram/Telegram), номер и текущий ответственный
с кнопкой «Передать». Передача меняет `owner_user_id` треда — диалог уезжает к
выбранному сотруднику с историей, новые входящие идут ему. Передать можно только
сотруднику воркспейса (не клиенту).

- Новый [`ChatSettingsChannelInfo.tsx`](../../src/components/messenger/ChatSettingsChannelInfo.tsx)
- [`ChatSettingsDialog.tsx`](../../src/components/messenger/ChatSettingsDialog.tsx) — показ для личных диалогов с каналом
- Мутация `useChangeThreadOwner` + `owner_user_id` в типе `ProjectThread`
  ([`useProjectThreads.mutations.ts`](../../src/hooks/messenger/useProjectThreads.mutations.ts),
  [`useProjectThreads.types.ts`](../../src/hooks/messenger/useProjectThreads.types.ts))

> Замечание: `owner_user_id` физически приходит на фронт через `useProjectThreadById`
> (`.select('*')`), хотя RPC `get_workspace_threads` его не отдаёт и в типе его не было.

## 2. Уведомления о чужих личных диалогах (приватность)

**Проблема.** [`useNewMessageToast`](../../src/hooks/messenger/useNewMessageToast.ts)
подписан на все `project_messages` воркспейса, фильтр только «не своё сообщение».
RLS пускает владельца/менеджеров ко всему → им всплывали тосты и звучал звук о
чужих личных переписках.

**Решение.** Для тредов без `project_id` (личные диалоги) тост и звук — только
владельцу диалога (`owner_user_id = текущий юзер`). Проектные/клиентские треды не
затронуты (там уведомление по доступу к проекту — корректно).

## 3. Контур непрочитанного в чужих личных диалогах

**Проблема.** Когда владелец/менеджер открывает личный диалог сотрудника на
просмотр, его отметка прочтения там пуста → весь тред горел красным контуром
«непрочитано».

**Решение.** Флаг `suppressUnread` в [`MessageList.tsx`](../../src/components/messenger/MessageList.tsx):
для чужого личного диалога (`project_id NULL && owner_user_id != me`,
определяется в [`MessengerTabContent.tsx`](../../src/components/messenger/MessengerTabContent.tsx))
подсветка непрочитанного и разделитель отключаются.

## 4. Точка отсчёта непрочитанного = момент выдачи доступа

**Проблема.** «Непрочитано» отсчитывалось от начала времён: если для пары
(participant, thread) нет строки в `message_read_status`, ВСЕ сообщения треда
считались непрочитанными. Новый сотрудник, получивший доступ к проекту с
историей, видел тысячи фантомных непрочитанных.

**Решение (две фазы):**
- **Фаза 0 — разовое обнуление.** Всем участникам по доступным тредам проставлено
  «прочитано до сейчас» (1950 пар, прямой backfill в БД). Чистый старт.
- **Фаза 1 — сидирование на будущее.** Триггеры на INSERT в `project_participants`
  / `project_thread_members` / `task_assignees` проставляют `message_read_status`
  «прочитано до момента доступа» (`added_at` / `assigned_at`). Триггер на проект
  сидирует все треды проекта (любой `access_type`) → роле- и custom-доступ тоже
  покрыты. `ON CONFLICT DO NOTHING` — не перетираем существующий прогресс чтения.
  Миграция [`20260609_unread_baseline_seed_on_access.sql`](../../supabase/migrations/20260609_unread_baseline_seed_on_access.sql),
  функции `seed_read_status_on_{project_access,thread_member,assignee}`.

**Осталось (опционально).** Фаза 2 — формула-фолбэк в `get_inbox_threads_v2` (+7
RPC) для view_all-админов на тредах, где они не участники. Зафиксировано в ledger
как открытый вопрос.

## 5. Само-подключение личного Telegram сотрудником

**Проблема.** Подключить свой личный Telegram (Business / MTProto) можно было
только на странице «Настройки воркспейса → Интеграции», доступной владельцу/
менеджеру. Рядовой сотрудник туда не попадал — а подключение по определению
делает только сам владелец аккаунта. Замкнутый круг.

**Решение.** В Профиле появилась секция «Личный Telegram» — только своя строка
подключения, оба способа (MTProto / Business). Унификация без дублирования:
добавлен режим `selfOnly` в существующие
[`PersonalTelegramSection`](../../src/page-components/workspace-settings/IntegrationsTab/PersonalTelegramSection.tsx)
/ [`TelegramBusinessSection`](../../src/page-components/workspace-settings/IntegrationsTab/TelegramBusinessSection.tsx)
/ [`TelegramMTProtoSection`](../../src/page-components/workspace-settings/IntegrationsTab/TelegramMTProtoSection.tsx);
в профиле тот же компонент показывает только текущего пользователя
([`ProfilePage/PersonalTelegramSection.tsx`](../../src/page-components/ProfilePage/PersonalTelegramSection.tsx)),
в админке — обзор по всем. Диалоги подключения общие.

---

## Затронутые зоны и риски

- Карантин мессенджера: правки точечные, webhook/отправка/дедуп/RLS не тронуты.
  Расследование и состояние зафиксированы в
  [`messenger-ledger.md`](../../.claude/rules/messenger-ledger.md).
- БД: миграция-триггеры аддитивны (наполняют `message_read_status`, формулу inbox
  не меняют). Backfill Фазы 0 выполнен напрямую.
- Тесты: 677/677 зелёные. `tsc` и `eslint` чисты.
