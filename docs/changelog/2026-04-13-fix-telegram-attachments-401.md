# Фикс: файлы из веб-версии не отправлялись в Telegram (401)

**Дата:** 2026-04-13
**Тип:** fix
**Статус:** completed

---

## Проблема

При отправке файлов из веб-версии (продакшен) в Telegram-группу Edge Function `telegram-send-message` возвращала **401 Unauthorized**. Файлы сохранялись в Supabase Storage, но в Telegram не доходили. С локального dev-сервера всё работало.

## Причина

Код messenger вызывал `supabase.functions.invoke()` без предварительного обновления JWT-сессии. Если access_token протухал (Supabase JWT живёт 1 час), Edge Function получала невалидный токен и возвращала 401. На локальном сервере проблема не проявлялась — сессия обновлялась чаще из-за HMR/перезагрузок.

В проекте уже был хелпер `callEdgeFunctionRaw`, который делает `getSession()` перед вызовом, но messenger-код его не использовал.

## Решение

Добавлен `await supabase.auth.getSession()` перед каждым `supabase.functions.invoke()` в messenger-сервисах — это принудительно обновляет access_token если он протух.

## Затронутые файлы

| Файл | Изменение |
|------|-----------|
| `src/services/api/messenger/messengerService.ts` | `getSession()` перед `telegram-send-message`, `telegram-delete-message`, `telegram-edit-message` |
| `src/services/api/messenger/messengerDraftService.ts` | `getSession()` перед `telegram-send-message` при публикации черновика |
| `src/services/api/messenger/messengerReactionService.ts` | `getSession()` перед `telegram-set-reaction` |
