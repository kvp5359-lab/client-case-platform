# Баг-лог проекта

Здесь живут известные баги — открытые и решённые. Один файл = один баг.

## Как это работает

- **Открытые** баги лежат в [`open/`](open/). Это воспроизводимые проблемы, которые мы ещё не починили.
- **Решённые** переносятся в [`resolved/`](resolved/) после фикса — как исторический след, чтобы не расследовать заново, если похожее повторится.
- Каждый файл описывает симптомы, как воспроизвести, расследование, гипотезы, варианты фикса. См. любой существующий файл как шаблон.
- Индекс ниже — одна строка на баг, ссылка на полный файл. Обновляется вручную при создании/закрытии бага.

## Для Claude

При жалобе на странное поведение, **сначала** проверь индекс ниже и `docs/bugs/open/` — возможно, этот баг уже расследован. Если да — продолжай с того места, где остановились, не начинай расследование с нуля. Если это новый баг — создай новый файл, не смешивай с существующими.

## Открытые

| ID | Severity | Область | Название | Замечен |
|---|---|---|---|---|
| [2026-07-06-project-load-fail-after-create](open/2026-07-06-project-load-fail-after-create.md) | low | ProjectContext, create-project, race | «Не удалось загрузить проект» сразу после создания (разовая гонка, Sentry) | 2026-07-06 |
| [2026-07-08-project-tasks-errorboundary-crash](open/2026-07-08-project-tasks-errorboundary-crash.md) | medium | ProjectPage, tasks, ErrorBoundary, sentry | Краш экрана «Задачи» проекта (ErrorBoundary); стек скрывала проводка логгера — исправлено, ждёт следующего краша со стеком | 2026-07-08 |
| [2026-07-08-sentry-load-fail-noise](open/2026-07-08-sentry-load-fail-noise.md) | low | sentry, logger, data-loading, noise | Sentry шумит на транзиентных «Не удалось загрузить …» (69 путей → алерты) | 2026-07-08 |
| [2026-07-10-project-page-max-update-depth](open/2026-07-10-project-page-max-update-depth.md) | medium | ProjectPage, react, render-loop, sentry | «Maximum update depth exceeded» на странице проекта (бесконечный setState-цикл); стек минифицирован — нужны sourcemaps | 2026-07-10 |

## Решённые

| ID | Severity | Область | Название | Решён |
|---|---|---|---|---|
| [2026-04-22-scroll-jitter-touchpad](resolved/2026-04-22-scroll-jitter-touchpad.md) | medium | messenger, history, scroll | Дёрганье при прокрутке истории и чатов на тачпаде MacBook | 2026-05-24 |
| [2026-05-13-telegram-multibot-message-duplicates](resolved/2026-05-13-telegram-multibot-message-duplicates.md) | high | telegram-webhook, project_messages | Сообщения клиента дублируются 2-3 раза в треде (per-bot message_id у Telegram при нескольких ботах в группе) | 2026-05-13 |
| [2026-05-13-thread-insert-returning-rls](resolved/2026-05-13-thread-insert-returning-rls.md) | critical | rls, project_threads, can_user_access_thread | INSERT INTO project_threads ... RETURNING * падает с 42501 (3-я регрессия) | 2026-05-13 |
| [2026-04-10-telegram-reactions-media-group](resolved/2026-04-10-telegram-reactions-media-group.md) | medium | telegram-webhook, telegram-send-message | Реакции на файлы в Telegram media group приходят как отдельные сообщения | 2026-04-21 |
| [2026-05-27-telegram-lost-attachments](resolved/2026-05-27-telegram-lost-attachments.md) | high | telegram-webhook-v2, media, storage | Ложная плашка «Файл из Telegram не загружен» при multi-bot (downloadAttachments на enriched) | 2026-05-28 |
| [2026-05-28-telegram-send-stuck-pending](resolved/2026-05-28-telegram-send-stuck-pending.md) | high | telegram-send-message, uq_telegram_message_per_chat | Сообщения зависают в pending (msg_id collision между ботами) | 2026-05-28 |
