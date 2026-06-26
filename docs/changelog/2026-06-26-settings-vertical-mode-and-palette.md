# Вертикальный режим настроек + настраиваемая палитра цветов чатов

**Дата:** 2026-06-26
**Тип:** feat
**Статус:** completed (ждёт деплоя фронта)

> В этот пуш вошли также правки из прошлых сессий, лежавшие в рабочем дереве:
> плавающий бейдж даты в ленте, гранулярный фолбэк вложений (карантин) и
> UPDATE-политика избранного — см. раздел «Из прошлых сессий».

## Настраиваемая палитра акцентов

Каждый из 17 акцентных цветов тредов можно перекрасить на уровне воркспейса —
основной (тёмный) и светлый тон отдельно.

- Ядро `src/lib/accentPalette.ts`: карты стилей используют arbitrary-классы с
  CSS-переменной и фолбэком на текущий цвет — `bg-[var(--acc-blue-main,#3b82f6)]`.
  Где воркспейс не переопределял — берётся фолбэк, вид идентичен прежнему.
  Переопределения инжектятся глобально (`AccentThemeStyle`) → все 13 карт стилей
  (бабл, инбокс, бейджи, таймлайн, реакции, кнопка отправки и т.д.) подхватывают.
- Динамические var-классы перечислены в `tailwind.config.ts` через
  `accentSafelist()` (сканер их в исходниках не видит).
- БД: `workspaces.accent_overrides` (jsonb) — только переопределённые цвета.
- Контраст текста на тёмном баббле подбирается автоматически по яркости.

## Раздел «Палитра цветов» в настройках

- Отдельный раздел настроек (`/settings/palette`) — вынесен из «Общих».
- Под каждым цветом — живые тестовые бабблы (исходящее = тёмный тон,
  входящее = светлый, чип реакции). Меняешь тон — примеры обновляются сразу.
- **Названия цветов редактируемые** (`accent_overrides[slug].name`), широкая
  колонка имён, кнопка «Сбросить к стандартному».

## Вертикальный режим настроек

Раздел настроек больше не использует верхние вкладки.

- В режиме `/settings/*` основной сайдбар (проекты) **заменяется на вертикальное
  меню разделов настроек** — тот же сайдбар (`WorkspaceSidebarFull`, проп
  `settingsMode`): та же обёртка/фон, воркспейс-пикер сверху, профиль снизу.
  Средняя часть (поиск/проекты) → меню настроек (`SettingsNav`).
- Меню сгруппировано: Пространство / Контент / Каналы / Прочее. Пункты ведут на
  существующие роуты `/settings/<tab>` — сами вкладки и редакторы не менялись.
  «← Назад в пространство» возвращает к проектам.
- `WorkspaceSettingsPage`: убран `TabsList`, заголовок — по активному разделу.
- «Справочники»/«Шаблоны»/«Интеграции» работают как есть: их внутренняя
  под-навигация ходит по `/settings/*`, поэтому меню настроек остаётся на месте.

## Из прошлых сессий (вкоммичены вместе)

- **Плавающий бейдж даты** (`messenger/MessageList.tsx`): при прокрутке ленты
  показывает текущий день и гаснет в простое (как в Telegram/WhatsApp). По
  разделителям дат (`[data-sep-day]`), `position: sticky`, `setState` только при
  смене дня.
- **🔴 Карантин. Гранулярный фолбэк вложений** (`telegram-send-message/attachments.ts`):
  при частичном провале отправки повторяется/фолбэчится ТОЛЬКО упавшая категория
  (картинки/документы), а не всё заново — иначе дублировались уже доставленные
  файлы (фикс multi-bot, подробно — `messenger-ledger.md` 2026-06-26).
  **Edge-функция деплоится отдельно** (`supabase functions deploy
  telegram-send-message --no-verify-jwt`).
- **UPDATE-политика избранного** (`migrations/20260625_user_favorites.sql`):
  добавлены RLS UPDATE-policy + grant — нужны для ручной сортировки (`sort_order`).
  **Применяется отдельно** (`supabase db push` / уже в проде через MCP).

## Файлы

- `src/lib/accentPalette.ts`, `tailwind.config.ts`
- `src/components/AccentThemeStyle.tsx`, `src/components/WorkspaceLayout.tsx`
- `src/components/WorkspaceSidebarFull.tsx`, `src/components/WorkspaceSidebar/SettingsNav.tsx`
- `src/page-components/WorkspaceSettingsPage.tsx`,
  `src/page-components/workspace-settings/GeneralSettingsTab.tsx`,
  `src/page-components/workspace-settings/components/AccentPaletteSection.tsx`
- `src/app/(app)/workspaces/[workspaceId]/settings/palette/page.tsx`
- + 13 карт стилей акцентов (threadConstants, messageStyles, chatVisuals,
  InboxChatItem, UnreadBadge, TimelineFeed, InboxChatHeader, ReactionBadges,
  MessageInputToolbar, ComposerVisibilitySwitch, ChatSettingsIconColorPicker)
- Из прошлых сессий: `src/components/messenger/MessageList.tsx`,
  `supabase/functions/telegram-send-message/attachments.ts`,
  `supabase/migrations/20260625_user_favorites.sql`
