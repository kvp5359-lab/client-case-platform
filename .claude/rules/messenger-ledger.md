# 📓 Messenger Ledger — журнал и точка входа по мессенджеру

> **Мессенджер — самый чувствительный блок проекта.** Это его единая дверь.
> Любая правка/расследование мессенджера начинается отсюда и фиксируется сюда.

## ⛔ Прежде чем трогать мессенджер

1. **Прочитай этот файл целиком** — раздел «Повторяющиеся грабли» экономит часы.
2. Затем профильный источник правды (этот файл их **не дублирует**, а ссылается):
   - [`channels.md`](./channels.md) — как устроены каналы (матрица, контракты, авторизация Edge).
   - [`gotchas.md`](./gotchas.md) — ловушки кода/БД (RLS, дедуп, секреты, маршрутизация).
   - [`docs/bugs/`](../../docs/bugs/) — детальные разборы багов.
3. Мессенджер — **карантинная зона** ([`refactoring.md`](./refactoring.md)): не рефакторить «заодно», только точечно под задачу, со смок-тестом.

## ✍️ После правки мессенджера — обнови этот файл

- Новое расследование (даже неудачное) → строка в «Журнал расследований» с **гипотезами, включая отвергнутые**.
- Изменилось что работает/в процессе → поправь «Текущее состояние».
- Нашёл новые грабли → допиши в «Повторяющиеся грабли».
- Контракт кода/БД → в `gotchas.md`, сюда только ссылку.

> Гипотезы и **развороты** — самое ценное здесь. Они не попадают в changelog, но именно они не дают второй раз чинить не там.

---

## 🟢 Текущее состояние

**Каналы** (детали — [`channels.md`](./channels.md#матрица-возможностей)): TG group (бот-секретарь + личные боты сотрудников), TG Business, TG MTProto, Wazzup, Email. Единый `send_status` (`pending`/`sent`/`failed`), авторетраев нет — только кнопка «Повторить».

**Открытые вопросы / в работе:**

| Дата | Тема | Статус |
|------|------|--------|
| 2026-06-05 | **Reply-цитата в multi-bot группах** (cross-bot). Фикс «дозапись связки бот-владельцем» в проде (v2 v67, v1, business) | ⏳ **Ждёт смок-теста** на боевой группе с двумя активными ботами (оригинал от одного бота, реплай ловит другой) |
| 2026-06-05 | **Bot-to-Bot Communication Mode** (Bot API 10.0) как альтернатива reply-фиксу | 🛑 **Воспроизвёлся риск G6:** при активации у секретаря наши `web`-исходящие прилетели как `telegram`-входящие → эхо-дубли (текст + 2 файла). Откатили (выключили режим у секретаря), 3 дубля удалили. **Защита `is_bot` НЕ задеплоена** (откат по просьбе). Повторно включать только ПОСЛЕ деплоя защиты |
| 2026-06-09 | **«Файл слишком большой» на обычном фото.** Метка `too_large` сработала на пересланном photo, что для сжатого TG-фото нетипично | 🔍 **Диагностика в проде** (media.ts пишет реальный размер в `attachment_error.stage='too_large'` + в видимую метку). Ждём следующего такого файла, чтобы отличить «реально >20 МБ» от бага подсчёта |
| 2026-06-09 | **Точка отсчёта непрочитанного = момент выдачи доступа.** Фаза 0 (обнуление 1950 пар) ✅ + Фаза 1 (триггеры сидирования) ✅ в проде | ✅ **Основное решено.** Осталась опц. Фаза 2 — формула-фолбэк в `get_inbox_threads_v2` (+7 RPC) для view_all-админов на тредах, где они НЕ участники. Делать отдельно, чувствительная RPC. Триггеры: `seed_read_status_on_{project_access,thread_member,assignee}`, миграция `20260609_unread_baseline_seed_on_access.sql` |

**Известные пределы платформы Telegram (не баги, чинить нельзя):**
- Бот **не видит сообщения других ботов** — даже админ/privacy off. Отсюда весь multi-bot reply (§G5).
- Reactions/edit/delete не поддержаны WhatsApp/Wazzup.
- MTProto — только private chats, не группы.

---

## 🔬 Журнал расследований (хронология)

### 2026-06-10 — Инбокс на пагинации: три связанных бага (каскад, красные баблы, поиск) ⭐
Все три — следствие майского перехода инбокса на keyset-пагинацию (`get_inbox_threads_page`, `useInboxThreadsV2` стал отдавать только загруженные страницы вместо полного списка). Код полагался на «inbox v2 = все треды».

- **Баг 1 — подвисание «Загружаем ещё…» 3-4 сек на вкладке «Непрочитанные».**
  - **Гипотезы:** ✗ медленная RPC (замер: страница ~130-160 мс) · ✗ access-фильтр режет (замер: 899 из 902 доступно, почти no-op) · ✓ **корень:** фильтр «Непрочитанные» клиентский поверх серверной пагинации. Непрочитанных единицы (8 из 899), разбросаны по списку → короткий после фильтра список держал IntersectionObserver-«маячок» в зоне видимости → каскад из ~18 последовательных страниц.
  - **Фикс:** RPC `get_inbox_unread_threads` (обёртка над v2 + фильтр непрочитанного, потолок 100) — все непрочитанные одним запросом. Вкладка «Непрочитанные» работает на нём, без пагинации/каскада. `useFilteredInboxUnread`, правки `useInboxFilters`/`BoardInboxList`/`InboxPage`.
- **Баг 2 — ложные красные «непрочитанные» баблы в открытом треде.**
  - **Симптом:** в треде, открытом из проекта/доски, чужие сообщения красные, хотя прочитаны (сервер: `unread_count=0`, `last_read_at` позже всех).
  - **Корень:** `useLastReadAt` искал тред в `useInboxThreadsV2` (пагинированный) → для треда за пределами загруженных страниц (поз. 162) `find`=undefined → `last_read_at=null` → `MessageList` красит всё чужое.
  - **Фикс:** RPC `get_inbox_thread_one(ws,user,thread)` (обёртка над v2 по одному треду); `useLastReadAt` переведён на точечный запрос на ключе `messengerKeys.lastReadAtByThreadId` — его уже патчат все mark-read мутации → контур исчезает мгновенно. `useUnreadCount` оставлен на inbox-кэше (fallback 0 безопасен).
- **Баг 3 — поиск во «Входящих» не находит дальние диалоги.**
  - **Корень:** поиск фильтровал только загруженные страницы (первые 50). Маскировалось каскадом из бага 1; после его отключения обнажилось.
  - **Фикс:** RPC `get_inbox_search_threads(ws,user,query,limit)` (обёртка над v2 + `thread_name/project_name ILIKE`, экранирование LIKE). `useFilteredInboxSearch` + debounce 300мс в `BoardInboxList`/`InboxPage`; пагинация при поиске off. Только по названию треда/проекта (не по тексту сообщений).
- **Грабли (новое):** после пагинации **любой потребитель, ждущий от `useInboxThreadsV2` полного списка, сломан** — `useLastReadAt`/`useUnreadCount`/локальный поиск/клиентские фильтры. Для конкретного треда — точечный RPC по `thread_id`; для подмножеств (непрочитанные, поиск) — отдельный серверный RPC-обёртка над v2.
- **На будущее:** `get_inbox_unread_threads`/`_thread_one`/`_search_threads` — обёртки над `get_inbox_threads_v2` (сканит весь инбокс ~150мс). На больших объёмах переписать на прямой доступ. Колонка `project_threads.inbox_sort_at`+триггеры (27 мая) не читаются `get_inbox_threads_page` — мёртвые.
- **Файлы:** миграции `20260601_inbox_unread_threads.sql`, `20260601_inbox_thread_one.sql`, `20260610_inbox_search_threads.sql`; `inboxService.ts`, `useFilteredInbox.ts`, `useUnreadCount.ts`, `queryKeys/messenger.ts`, `useInboxFilters.ts`, `InboxPage/index.tsx`, `BoardInboxList.tsx`. Changelog: `2026-06-01-inbox-unread-fixes.md`, `2026-06-10-inbox-server-search-and-sticky-filters.md`.

### 2026-06-09 — Доступ к треду проекта исполнителю/участнику без доступа к проекту
- **Задача (не баг):** дать сотруднику доступ к задаче/треду, если он назначен исполнителем (`task_assignees`) или добавлен участником (`project_thread_members`), даже когда доступа к самому проекту нет. Решение заказчика: членство решает всё, на **любые** треды проекта (вкл. клиентские чаты) + UI-предупреждение «увидит всю переписку».
- **Корень старого поведения:** для тредов с `project_id` функции `can_user_access_thread` (обе сигнатуры) обрывались на `v_project_roles IS NULL → false` **до** проверки assignee/member. Для orphan-тредов это уже работало (20260520).
- **Фикс (миграция `20260609_thread_access_via_assignee_member_in_project.sql`):** проверки assignee/member подняты выше гейта по проекту в обеих RLS-функциях; в `get_inbox_threads_v2` и `get_inbox_thread_aggregates` добавлена третья ветка `accessible_threads` (треды проекта, где юзер assignee/member); в `get_workspace_threads` участник виден в любом режиме доступа. Сигнатура `(uuid,uuid)` охраняет и `project_messages` → доступ к переписке приходит автоматически.
- **Смок-тест на проде (read-only):** исполнитель/участник без доступа к проекту → видит тред (обе функции) + в списке; leak-check «доступ без причины» = 0.
- **⚠️ Drift:** живые `get_inbox_threads_v2` (`last_message_attachment_mime`) и `get_workspace_threads` (`start_at/end_at`) расходились с репо — применялись напрямую без файла-миграции. Тела взяты из живой БД и зафиксированы. Возможны другие дрейфанувшие RPC — не сверяли.
- **Файлы:** миграция выше; UI — `AssigneesPopover.tsx`, `ChatSettingsAssignees.tsx`, `ChatSettingsAccess.tsx`.

### 2026-06-09 — Личные диалоги: чужие уведомления, контур, передача владельца
- **Симптом 1 (Wazzup):** канал в настройках привязан Анне, входящие падают владельцу. **Корень:** webhook берёт `owner_user_id` только при СОЗДАНИИ треда (`ensureWazzupThread`); смена сотрудника у канала не переназначает уже существующие треды. Существующий тред переиспользуется по `(wazzup_channel_id, wazzup_chat_id)` без обновления owner. **Не баг кода — by design жёсткой связки канал↔тред.** Решение продуктовое: добавлена ручная **передача диалога** (смена `owner_user_id`).
- **Симптом 2:** владелец/менеджер получает тосты-уведомления о ЧУЖИХ личных диалогах. **Корень:** `useNewMessageToast` подписан на все `project_messages` воркспейса, фильтр только «не своё сообщение»; RLS пускает владельца ко всему → тост на всё. **Фикс:** для тредов без `project_id` тост/звук только если `owner_user_id = текущий юзер`.
- **Симптом 3:** в чужом личном диалоге весь тред горит красным контуром «непрочитано». **Корень:** нет записи в `message_read_status` для (владелец, чужой тред) → `last_read_at NULL` → всё непрочитано (та же формула, что в inbox v2). **Фикс (UI-only):** флаг `suppressUnread` в `MessageList`, включается для чужого личного диалога (`project_id NULL && owner_user_id != me`).
- **Связанная общая проблема (НЕ сделано, в работе):** «непрочитано» отсчитывается от начала времён, а не от момента выдачи доступа → новому сотруднику прилетают тысячи фантомных непрочитанных в переданных проектах. Решение согласовано: точка отсчёта = момент выдачи доступа (`project_participants.added_at` / `project_thread_members.added_at` / `task_assignees.assigned_at`), формула в RPC `get_inbox_threads_v2` (`20260516_inbox_v2_add_last_read_at.sql`, строки 99-107) + сидирование `message_read_status` при выдаче доступа; старое — обнулить разово. Нет триггера-сидирования сейчас (есть только `mark_thread_read_on_final_status`).
- **Файлы:** `ChatSettingsChannelInfo.tsx` (новый), `ChatSettingsDialog.tsx`, `useProjectThreads.{types,mutations}.ts` (`useChangeThreadOwner` + `owner_user_id` в типе), `useNewMessageToast.ts`, `MessageList.tsx`, `MessengerTabContent.tsx`. Коммиты в main, без пуша.
- **Урок:** `owner_user_id` физически приходит на фронт через `useProjectThreadById` (`.select('*')`), хотя RPC `get_workspace_threads` его не отдаёт и в типе `ProjectThread` его не было.


Формат: **симптом → гипотезы (вкл. ✗отвергнутые) → корень → фикс → ссылки**.

### 2026-06-09 — Bot-to-Bot эхо-дубли (риск G6 воспроизвёлся) + «слишком большой» файл
- **Эхо-дубли (Bot-to-Bot Mode):**
  - **Симптом:** наше исходящее (текст + 2 PDF) появилось в треде ещё и как входящее от клиента.
  - **Корень:** включили Bot-to-Bot Communication Mode (Bot API 10.0) у **бота-секретаря**. Он начал видеть исходящие employee-бота и записал их как входящие. Обычный content-dedup не ловит: оригинал `source='web'`, эхо `source='telegram'` (`uq_project_messages_telegram_content_dedup` партиальный по `source='telegram'`). Эхо опознаётся по `telegram_sender_user_id = <id бота>`.
  - **Фикс:** откатили — выключили режим у секретаря. 3 эхо-записи удалили. Готова (но **НЕ задеплоена**, откат по просьбе) защита: в группе `if (!isPrivate && msg.from?.is_bot) return` в `telegram-webhook-v2/sync.ts`. Цитаты она не трогает (реплай приходит в сообщении человека). **Перед повторным включением Bot-to-Bot — задеплоить защиту.** См. §G6.
- **«Файл слишком большой» на обычном фото:**
  - **Симптом:** пересланное фото-таблица → метка «слишком большой (макс 20 МБ)», хотя визуально не тяжёлое.
  - **Измерено:** метка `too_large` ставится только если файл **скачался** и `byteLength > 20 МБ` ([media.ts:197](../../supabase/functions/telegram-webhook-v2/media.ts)); при отказе getFile была бы метка `failed`. Один файл (photo), второго document не было. Реальный размер **нигде не сохранялся** — пробел диагностики, постфактум не доказать.
  - **Гипотезы (открыто):** ✗ getFile отказал (тогда был бы `failed`) · ? реально >20 МБ (для сжатого TG-photo нетипично) · ? баг подсчёта/скачивания.
  - **Действие:** добавил диагностику размера в `media.ts` (пишет фактические МБ в `attachment_error.stage='too_large'` и в видимую метку). Ждём следующего случая для вердикта. Статус — «Открытые вопросы».

### 2026-06-05 — Reply-цитата теряется в группе с несколькими ботами
- **Симптом:** клиент отвечает реплаем на наше исходящее в группе — в ЛК цитата не подтягивается. «Через раз».
- **Гипотезы:**
  - ✗ «Telegram не отдаёт `reply_to_message.date`, починим фолбэком по дате» → date-фолбэк (коммит `8578780`) **не сработал** на cross-bot. Измерено: 100% корреляция cross-bot ↔ нет цитаты.
  - ✗ «Нерешаемо: бот не видит чужих ботов, данных нет ни у кого» → **ложь**. Данные есть у бота-**владельца** оригинала.
  - ✓ **Истинный корень:** Telegram гарантированно отдаёт реплай боту-владельцу письма (он видит свой оригинал). Но при **гонке вставки** строку часто пишет другой («слепой») бот без связки, а правильную связку от владельца наш `enrich` отбрасывал — UPDATE стоял с `.is(bot_integration_id, null)` (дозапись только поверх секретаря, не поверх другого employee-бота).
- **Фикс:** при 23505 любой бот, разрешивший reply (`replyToDbId`), дописывает `reply_to_message_id` туда, где он ещё `NULL` — не трогая чужой `bot_integration_id`, не перезаписывая готовую связку. Коммит `eb2a3a0`.
- **Подтверждено докой:** [Bot API changelog 10.0](https://core.telegram.org/bots/api-changelog), [Bots FAQ](https://core.telegram.org/bots/faq).
- **Статус:** в проде, ждёт смок-теста (см. «Текущее состояние»).
- **Урок:** «нереально» относилось к ложной картине. Чинить надо было **свой код**, не Telegram. Скепсис заказчика к первому выводу заставил перемерить факты.

### 2026-05-28 — Сообщения зависают в pending (msg_id collision) ⭐
- **Симптом:** ~6 сообщений у одного сотрудника за день — баббл крутится → красное, хотя в TG доставлены.
- **Гипотезы (4 слоя одной поломки):** ✗ «33мс ответ / кэш» → ✗ «realtime UPDATE не пришёл» → ✗ «catch fallback тихо глотает» → ✓ **23505 на `uq_telegram_message_per_chat`**.
- **Корень:** UNIQUE индексировал `(chat, msg_id)` **без бота**. Разные боты в группе имеют **независимую нумерацию msg_id** → законно пересекаются. Старый бот занял `(chat,328)`, новый через дни дошёл до своего 328 → 23505 на `markMessageSent` → зависание.
- **Фикс:** миграция `20260528_fix_uq_telegram_message_per_chat_include_bot` — третий компонент `COALESCE(bot_integration_id::text,'secretary')`. Manual recovery 6 жертв.
- **Урок:** **diagnostic write до критичной операции** (`candidate_markSent` перед `markMessageSent`) окупился в первый же случай.
- **Ссылки:** [`docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md`](../../docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md), [`gotchas.md`](./gotchas.md#️-uq_telegram_message_per_chat-обязательно-включает-bot_integration_id).

### 2026-05-28 — Зомби-тосты «Не удалось отправить»
- **Симптом:** баббл синий (sent), но тосты «Повторить» висят. Опасно — повтор создаёт дубль в TG.
- **Корень:** при переходе в `sent` (вкл. manual recovery) `message_send_failures.resolved_at` не обновлялся.
- **Фикс:** триггер `AFTER UPDATE OF send_status` → при `pending/failed → sent` закрывает все `message_send_failures` по этому message_id. Миграция `20260528_auto_resolve_send_failures_on_sent`.

### 2026-05-28 — Потеря вложений (downloadAttachments race)
- **Симптом:** ложная плашка «Файл из Telegram не загружен», хотя файл лежит.
- **Корень:** `downloadAttachments` вызывался при любом непустом `rowId`, включая `enriched` (второй бот) → повторный upload `upsert:false` → 23505 → `attachment_status='failed'` поверх успешной загрузки.
- **Фикс:** вызывать **строго** при `outcome === 'inserted'`. Коммит `0e4e6c2`.
- **Ссылки:** [`docs/bugs/resolved/2026-05-27-telegram-lost-attachments.md`](../../docs/bugs/resolved/2026-05-27-telegram-lost-attachments.md), [`gotchas.md`](./gotchas.md#downloadattachments-только-при-outcomeinserted).

### 2026-05-27 — Бот-секретарь не привязан к группе (self-healing)
- **Симптом:** «chat not found» от личного бота + fallback на секретаря падает 500 (`integration_id=NULL`). 18% групп — «сироты».
- **Корень:** webhook `/link` не записывал `integration_id`.
- **Фикс:** `findSecretaryInGroup` через TG `getChat`, self-healing `resolveBotToken`, `/link` пишет id, маркер `ERR_NO_SECRETARY_IN_GROUP`, UI `ThreadHealthBanner`. Backfill 13/15. Коммит `fc66885`.
- **Ссылки:** [`docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md`](../../docs/changelog/2026-05-27-telegram-secretary-self-healing-ux-fixes.md).

### 2026-05-26 — Вложения внутреннего чата висят в pending
- **Корень:** в `dispatch_message_to_channels` ранний `RETURN` на `has_attachments=true` стоял **до** проверки канала.
- **Фикс:** перенёс проверку внутрь каждой ветки канала. Миграция `20260526_fix_internal_thread_attachments_send_status`.

### 2026-05-26 — Multi-file dedup теряет сообщения
- **Корень:** клиент шлёт 3 файла за секунду → UNIQUE по `md5(content='📎')` глотал 2-й/3-й.
- **Фикс:** расширить дедуп-ключ на `telegram_file_unique_id`. Миграция `20260526_telegram_file_unique_id_dedup`, коммит `9d96681`.

### 2026-05-13 — INSERT...RETURNING на project_threads падает 42501 (RLS) ⭐
- **Симптом:** создание треда падает с 42501. Ловили **5 раз** (регрессии).
- **Корень:** `can_user_access_thread(uuid,uuid)` перечитывал тред; для RETURNING-строки SELECT-полиция внутри SECURITY DEFINER не видела свежевставленную строку → false.
- **Фикс (постоянный):** row-overload `can_user_access_thread(project_threads, uuid)` — получает row через тип, не перечитывает. Миграция `20260524_can_user_access_thread_row_overload`. Short-circuit `created_by` больше **не нужен**.
- **Ссылки:** [`docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md`](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md), [`gotchas.md`](./gotchas.md#-rls-на-project_threads--закрыто-2026-05-24).

### 2026-05-13 — Дубли сообщений клиента (multi-bot) ⭐
- **Корень:** 2+ бота в группе → Telegram даёт каждому **свой** msg_id для одного сообщения клиента. UNIQUE по msg_id их не ловит.
- **Фикс:** content-based dedup `uq_project_messages_telegram_content_dedup` (chat, sender, date, md5(content), file_unique_id).
- **Ссылки:** [`docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md`](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md), [`gotchas.md`](./gotchas.md#️-дедуп-между-несколькими-ботами-в-одной-telegram-группе).

### Ранее (апрель — середина мая) — крупные вехи
Полные детали — в changelog (см. Индекс). Кратко:
- **2026-04-19 / 05-02** — telegram-webhook-v2, серверная настройка вебхука, токены ботов из БД (не env).
- **2026-05-03** — общие хелперы `_shared/` для реакций и входящих; MTProto end-to-end.
- **2026-05-04** — Wazzup + рефакторинг мессенджера.
- **2026-05-07** — апгрейд группы→супергруппы (migrate_to_chat_id), reply после миграции.
- **2026-05-11** — распил монолитов webhook-v2 и send-message на модули.
- **2026-05-21** — идемпотентность отправки (защита от двойных).
- **2026-05-22** — unified `send_status` по всем каналам.
- **2026-05-28** — унификация webhook: employee-боты на v2.

---

## 🪤 Повторяющиеся грабли (где «лечили не там»)

**G1. Multi-bot: у каждого бота своя нумерация msg_id.**
В группе с 2+ ботами `message_id` уникален только в пределах одного бота. Никогда не полагаться на «msg_id уникален в чате». Затрагивает: дедуп incoming (§2026-05-13), UNIQUE на отправке (§2026-05-28), reply (§2026-06-05).

**G2. Бот не видит сообщения других ботов.**
Даже админ / privacy off / Bot-to-Bot. Reply на сообщение чужого бота приходит без `reply_to_message`. Cross-bot связку доносит **только бот-владелец** оригинала (§2026-06-05). Не пытаться «прочитать чужого бота» через Bot API — только MTProto (юзер-аккаунт).

**G3. RLS на project_threads + INSERT...RETURNING.**
SECURITY DEFINER STABLE функция, перечитывающая тред, ломает RETURNING. Закрыто row-overload (§2026-05-13). Не возвращать перечитывающую сигнатуру для SELECT-полиции. Старую `(uuid,uuid)` НЕ удалять — её юзают 8 политик смежных таблиц.

**G4. Дедуп через раннюю вставку, а не проверку.**
Полагаемся на UNIQUE + 23505 → outcome (`inserted`/`enriched`/`duplicate`). Любая операция «после вставки» (downloadAttachments, enrich, markSent) должна учитывать, какой именно outcome (§downloadAttachments, §reply).

**G5. enrich дописывает поверх секретаря, не другого employee.**
Историческое условие `.is(bot_integration_id, null)` в enrich рассчитано на «секретарь вставил, личный дописывает». Для employee-over-employee — промахивается. Reply-дозапись (§2026-06-05) это обходит отдельным UPDATE без фильтра по боту.

**G6. Bot-to-Bot Mode → риск дублей.**
Если активировать (передобавить ботов + админка/privacy off), боты начнут видеть исходящие друг друга → наши `web`-исходящие прилетят как `telegram`-входящие (обычный content-dedup не ловит, т.к. разный source) → дубли. **До активации** нужна защита: в группе игнорировать сообщения, отправленные ботами (`msg.from.is_bot`). Защита НЕ трогает цитаты (они приходят от людей).

**G7. Diagnostic write до критичной операции — окупается.**
Паттерн `candidate_*` в `telegram_error_detail` перед `markMessageSent` дал корень бага 05-28 в первый же случай. Применять при тёмных гонках.

**G8. Деплой Edge: флаг и хелперы.**
Webhook'и и `*-send` — `--no-verify-jwt` (иначе 401 от шлюза). Правка `_shared/syncTelegram*` требует **редеплоя всех** тянущих функций: `telegram-webhook-v2`, `telegram-webhook` (v1), `telegram-business-webhook`. См. [`gotchas.md`](./gotchas.md#--no-verify-jwt-для-webhook-и--send).

---

## 🗂 Индекс

**Правила:** [`channels.md`](./channels.md) · [`gotchas.md`](./gotchas.md) · [`refactoring.md`](./refactoring.md) (карантин) · [`audit-false-positives.md`](./audit-false-positives.md)

**Багдоки (resolved):**
- [2026-05-28 send stuck pending (msg_id collision)](../../docs/bugs/resolved/2026-05-28-telegram-send-stuck-pending.md)
- [2026-05-27 lost attachments](../../docs/bugs/resolved/2026-05-27-telegram-lost-attachments.md)
- [2026-05-13 multibot message duplicates](../../docs/bugs/resolved/2026-05-13-telegram-multibot-message-duplicates.md)
- [2026-05-13 thread insert RETURNING RLS](../../docs/bugs/resolved/2026-05-13-thread-insert-returning-rls.md)
- [2026-04-10 reactions media-group](../../docs/bugs/resolved/2026-04-10-telegram-reactions-media-group.md)

**Changelog (по теме):** `docs/changelog/` — фильтр `telegram|wazzup|gmail|messenger|send|secretary|mtproto`. Ключевые: `2026-05-28-telegram-send-msg-id-collision-fix`, `2026-05-28-telegram-webhook-unified`, `2026-05-27-telegram-secretary-self-healing-ux-fixes`, `2026-05-22-unified-send-status`, `2026-05-03-telegram-mtproto-end-to-end`, `2026-05-04-wazzup-and-messenger-refactor`, `2026-04-19-telegram-bot-v2`.

**Ключевые файлы кода:**
- Приём: `supabase/functions/telegram-webhook-v2/` (модули), `_shared/syncTelegramIncomingMessage.ts`, `_shared/syncTelegramReactions.ts`
- Отправка: `supabase/functions/telegram-send-message/`, `telegram-business-send`, `telegram-mtproto-send`, `wazzup-send`, `email-internal-send`; статус — `_shared/messageSendStatus.ts`
- Маршрутизация: триггер `notify_telegram_on_new_message` (БД)
- Фронт: `src/components/messenger/`, `src/hooks/messenger/`

**История git:** `git log --oneline -- 'supabase/functions/telegram*' '_shared/syncTelegram*' 'src/components/messenger'`
