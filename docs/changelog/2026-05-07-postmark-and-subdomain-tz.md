# ТЗ почты через Postmark и поддомены воркспейсов

**Дата:** 2026-05-07
**Тип:** docs
**Статус:** completed

---

## Контекст

В feature-backlog проекта добавлены два связанных архитектурных
ТЗ — фундамент для следующего большого этапа развития платформы.
Оба документа отражают согласованные с Claude решения, готовые
к реализации, и фиксируют выбор домена `clientcase.app` и текущий
slug воркспейса `rs`.

## Решение

### 1. Имейл через Postmark и поддомены воркспейсов

Документ: [`docs/feature-backlog/2026-05-04-email-postmark-internal-addresses.md`](../feature-backlog/2026-05-04-email-postmark-internal-addresses.md)

Переход с Gmail-OAuth-only модели на provider-agnostic схему
с внутренними адресами `<workspace-slug>.clientcase.app`:

- Виртуальные адреса с правилами маршрутизации (`support@`, `hh@`).
- Автоматические адреса на тред / проект (`t+abc123@`, `p+xyz789@`).
- Приём и отправка через Postmark (план Platform — Unlimited custom
  domains).
- Существующая Gmail-интеграция остаётся как опциональная фича
  «отправка от имени сотрудника из его Gmail».

**Зачем:** убрать привязку к Google, починить хрупкость watch-механизма
(уже был инцидент с пропавшими входящими), снять лимит 100 пользователей
testing-режима и упростить масштабирование.

### 2. Поддомены и custom-домены воркспейсов

Документ: [`docs/feature-backlog/2026-05-04-subdomain-per-workspace-routing.md`](../feature-backlog/2026-05-04-subdomain-per-workspace-routing.md)

Рефакторинг роутинга по схеме «как у Planfix / Notion / Substack»:

- `https://<slug>.clientcase.app/` — основной адрес воркспейса.
- `https://app.relostart.com/` — опциональный custom-домен владельца.
- Чистые внутренние URL без UUID:
  `https://rs.clientcase.app/projects/abc123`.
- Текущий `https://clientcase.kvp-projects.com/workspaces/<uuid>/...`
  уходит, со старого домена настраиваются legacy-редиректы.

**Зачем:** сделать переезд без боли пока пользователь один; custom-домены
становятся монетизируемой фичей Pro-тарифа.

## Файлы

**Новые:**

- `docs/feature-backlog/2026-05-04-email-postmark-internal-addresses.md` (663 строки)
- `docs/feature-backlog/2026-05-04-subdomain-per-workspace-routing.md` (375 строк)

## Деплой

Только документация — на функциональность приложения не влияет.
Деплой пройдёт стандартным blue/green pipeline'ом из
`.github/workflows/deploy.yml` после push в main, изменений в работе
сервиса быть не должно.

## Что осталось на потом

Сама реализация обоих ТЗ — отдельной задачей. Параллельная работа
по subdomain routing уже идёт в ветке `feat/subdomain-routing`
(не входит в этот пуш).
