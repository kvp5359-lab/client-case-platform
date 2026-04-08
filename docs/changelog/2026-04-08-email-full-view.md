# Просмотр полного email-письма в модалке — 2026-04-08

**Дата:** 2026-04-08
**Тип:** feature
**Статус:** completed

---

## Что сделано

### Просмотр полного email-письма
- В hover-меню email-сообщений добавлен пункт «Открыть письмо»
- По клику открывается модалка с полным содержимым письма: тема, от/кому/копия, дата, HTML-тело с форматированием
- HTML санитизируется через DOMPurify (существующий `sanitizeHtml`)

### Обновление документации инфраструктуры
- В `infrastructure.md` обновлён раздел деплоя: реальная схема CI/CD (GitHub Actions → Docker → GHCR → VPS)
- Добавлены секции: VPS, Nginx, таблица контейнеров на сервере
- `.mcp.json` добавлен в `.gitignore` (содержит секреты)

---

## Затронутые файлы

- `src/components/messenger/EmailFullViewDialog.tsx` (новый)
- `src/components/messenger/MessageActions.tsx`
- `src/components/messenger/MessageBubble.tsx`
- `.claude/rules/infrastructure.md`
- `.gitignore`
