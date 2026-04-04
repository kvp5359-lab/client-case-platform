# 📦 Библиотека UI компонентов (shadcn/ui)

**Актуальный список установленных компонентов для использования в проекте.**

---

## ✅ Установленные компоненты (33 штуки)

### Базовые элементы
1. **button.tsx** — кнопки (primary, secondary, destructive, outline, ghost, link)
2. **input.tsx** — текстовые поля ввода
3. **label.tsx** — метки для форм
4. **checkbox.tsx** — чекбоксы
5. **textarea.tsx** — многострочные текстовые поля

### Контейнеры
6. **card.tsx** — карточки контента (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
7. **dialog.tsx** — модальные окна
8. **sheet.tsx** — боковые панели
9. **popover.tsx** — всплывающие окна
10. **collapsible.tsx** — сворачиваемые элементы

### Формы
11. **form.tsx** — обёртка для форм с валидацией
12. **select.tsx** — селект/выбор
13. **multi-select.tsx** — множественный выбор
14. **date-picker.tsx** — выбор даты
15. **calendar.tsx** — календарь

### Визуальные элементы
16. **avatar.tsx** — аватары (Avatar, AvatarImage, AvatarFallback)
17. **badge.tsx** — значки и метки (default, secondary, destructive, outline)
18. **alert.tsx** — уведомления и алерты (Alert, AlertTitle, AlertDescription)
19. **separator.tsx** — разделительные линии
20. **skeleton.tsx** — заглушки загрузки
21. **tooltip.tsx** — подсказки

### Навигация и структура
22. **tabs.tsx** — вкладки
23. **dropdown-menu.tsx** — выпадающие меню
24. **sidebar.tsx** — боковая панель
25. **toggle.tsx** — переключатели
26. **toggle-group.tsx** — группа переключателей

### Таблицы и данные
27. **table.tsx** — таблицы
28. **native-table.tsx** — нативная таблица

### Специализированные компоненты
29. **field-group.tsx** — группа полей
30. **google-folder-picker.tsx** — выбор папки Google Drive
31. **floating-chat-button.tsx** — плавающая кнопка чата (как Intercom)

---

## 📋 Как использовать

### Импорт компонента:
```tsx
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
```

### Пример использования:
```tsx
export function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Заголовок</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" placeholder="your@email.com" />
          </div>
          <Button>Отправить</Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## ❌ НЕ установленные компоненты

Эти компоненты **НЕ ДОСТУПНЫ** и требуют установки перед использованием:

- toast / sonner — системные уведомления (установлено отдельно через sonner)
- scroll-area — прокручиваемые области
- switch — переключатели (есть toggle)
- radio-group — радио-кнопки
- slider — ползунки
- progress — прогресс-бары
- command — командная палитра
- context-menu — контекстное меню
- hover-card — карточка при наведении
- menubar — меню-бар
- navigation-menu — навигационное меню
- ...и другие

**Перед использованием:** Установить через `npx shadcn@latest add [название]`

---

## 🔄 Как добавить новый компонент

1. **Проверь, нужен ли компонент:**
   ```bash
   # Посмотри доступные компоненты
   npx shadcn@latest --help
   ```

2. **Установи компонент:**
   ```bash
   npx shadcn@latest add dialog
   npx shadcn@latest add tabs
   # и т.д.
   ```

3. **Обнови этот README:**
   - Добавь компонент в список "✅ Установленные"
   - Убери из списка "❌ НЕ установленные"
   - Укажи дату обновления

4. **Используй в коде:**
   ```tsx
   import { Dialog } from '@/components/ui/dialog'
   ```

---

## 📖 Документация

Официальная документация shadcn/ui: **https://ui.shadcn.com/**

Каждый компонент можно посмотреть на сайте:
- https://ui.shadcn.com/docs/components/button
- https://ui.shadcn.com/docs/components/card
- https://ui.shadcn.com/docs/components/input
- и т.д.

---

**Дата последнего обновления:** 14 декабря 2025  
**Всего компонентов:** 31 (shadcn) + 2 кастомных = 33








