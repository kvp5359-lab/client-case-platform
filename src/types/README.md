# Types - Типы приложения

## 📖 Обзор

Централизованная система типов для всего приложения.

## 🏗️ Структура

```
types/
├── database.ts              # ❌ НЕ РЕДАКТИРОВАТЬ! Auto-generated из Supabase
├── entities/                # ✅ Бизнес-сущности (удобные обертки)
│   ├── document.types.ts
│   ├── project.types.ts
│   ├── formKit.types.ts
│   ├── workspace.types.ts
│   └── index.ts
├── permissions.ts           # Типы для системы разрешений
├── formKit.ts              # Специфичные типы для форм
├── index.ts                # Публичный API
└── README.md               # Эта документация
```

---

## 📚 Использование

### 1. Auto-generated типы Supabase

**Файл:** `database.ts`

⚠️ **ВАЖНО:** Этот файл генерируется автоматически из схемы Supabase. НЕ редактируйте его вручную!

**Использование:**
```tsx
import { Tables, Database } from '@/types'

// Прямой доступ к типам таблиц
type Document = Tables<'documents'>
type Project = Tables<'projects'>
```

**Регенерация:**
```bash
npx supabase gen types typescript --project-id zjatohckcpiqmxkmfxbs > src/types/database.ts
```

---

### 2. Entities (Бизнес-сущности)

**Папка:** `entities/`

✅ Удобные обертки над auto-generated типами для использования в приложении.

#### Document Entity

```tsx
import {
  Document,
  DocumentWithFiles,
  DocumentFull,
  DocumentCreate,
  DocumentUpdate,
  DocumentFilters,
} from '@/types/entities'

// Использование
const document: Document = { ... }
const docWithFiles: DocumentWithFiles = {
  ...document,
  document_files: [...]
}

// Создание
const createDoc: DocumentCreate = {
  name: 'My Document',
  workspace_id: '...',
  // ... без id, created_at, updated_at
}

// Обновление
const updateDoc: DocumentUpdate = {
  name: 'Updated Name'
  // ... только измененные поля
}

// Фильтры
const filters: DocumentFilters = {
  workspace_id: '...',
  status: 'active',
  search: 'contract'
}
```

#### Project Entity

```tsx
import {
  Project,
  ProjectWithTemplate,
  ProjectFull,
  ProjectCreate,
  ProjectUpdate,
  ProjectStatus,
} from '@/types/entities'

// Использование
const project: Project = { ... }
const status: ProjectStatus = 'active' // 'active' | 'paused' | 'completed' | 'archived'

// С связанными данными
const projectFull: ProjectFull = {
  ...project,
  template: { ... },
  participants: [...],
  document_kits_count: 5
}
```

#### FormKit Entity

```tsx
import {
  FormKit,
  FormKitWithTemplate,
  FormKitFull,
  FormFieldType,
  FormResponseData,
} from '@/types/entities'

// Типы полей
const fieldType: FormFieldType = 'text' // 'text' | 'textarea' | 'number' | ...

// Данные ответа
const response: FormResponseData = {
  'field-1': 'Текстовый ответ',
  'field-2': 42,
  'field-3': ['option1', 'option2']
}
```

#### Workspace Entity

```tsx
import {
  Workspace,
  WorkspaceWithParticipants,
  Participant,
  Role,
  WorkspaceFeature,
} from '@/types/entities'

// Workspace
const workspace: Workspace = { ... }

// Features
const feature: WorkspaceFeature = 'ai_chat_assistant'
```

---

### 3. Unified Import

**Все типы через один импорт:**

```tsx
// Вариант 1: Отдельные импорты (рекомендуется)
import { Tables } from '@/types'
import { Document, Project, FormKit } from '@/types/entities'

// Вариант 2: Namespace импорт
import { Entities } from '@/types'
const doc: Entities.Document = { ... }
```

---

## 🎯 Преимущества новой структуры

### До:
```tsx
// Прямое использование auto-generated типов
import { Tables } from '@/types/database'

type Document = Tables<'documents'>

// Нужно вручную создавать расширенные типы
interface DocumentWithFiles extends Document {
  document_files: Tables<'document_files'>[]
}

// Нужно вручную создавать типы для Create/Update
type DocumentCreate = Omit<Document, 'id' | 'created_at' | 'updated_at'>
```

### После:
```tsx
// Готовые типы-обертки
import {
  Document,
  DocumentWithFiles,
  DocumentCreate,
  DocumentUpdate
} from '@/types/entities'

// Всё уже готово!
```

---

## 📋 Соглашения

### Именование типов

**Базовые типы:**
- `Document` — базовый тип таблицы
- `DocumentFile` — связанная сущность
- `DocumentFolder` — связанная сущность

**Расширенные типы:**
- `DocumentWithFiles` — базовый тип + связанные файлы
- `DocumentWithFolder` — базовый тип + папка
- `DocumentFull` — базовый тип + все связанные данные

**CRUD типы:**
- `DocumentCreate` — для создания (без id, timestamps)
- `DocumentUpdate` — для обновления (Partial)

**Вспомогательные типы:**
- `DocumentFilters` — фильтры для поиска
- `DocumentSort` — сортировка
- `DocumentStatus` — enum статусов

---

## 🔄 Добавление новой сущности

1. **Создайте файл в `entities/`:**
```tsx
// entities/newEntity.types.ts
import { Tables } from '../database'

export type NewEntity = Tables<'new_entities'>
export type NewEntityCreate = Omit<NewEntity, 'id' | 'created_at' | 'updated_at'>
export type NewEntityUpdate = Partial<NewEntityCreate>
```

2. **Экспортируйте в `entities/index.ts`:**
```tsx
export * from './newEntity.types'
```

3. **Всё! Типы доступны:**
```tsx
import { NewEntity } from '@/types/entities'
```

---

## 🧪 Использование в сервисах

```tsx
// services/api/documentService.ts
import { Document, DocumentCreate, DocumentUpdate } from '@/types/entities'

export async function createDocument(data: DocumentCreate): Promise<Document> {
  // Типы автоматически проверяются
}

export async function updateDocument(
  id: string,
  data: DocumentUpdate
): Promise<Document> {
  // Partial типы позволяют передавать только измененные поля
}
```

---

## 🎨 TypeScript Tips

### Utility Types

```tsx
// Pick - выбрать только нужные поля
type DocumentSummary = Pick<Document, 'id' | 'name' | 'created_at'>

// Omit - исключить поля
type DocumentWithoutTimestamps = Omit<Document, 'created_at' | 'updated_at'>

// Partial - все поля опциональны
type DocumentPartial = Partial<Document>

// Required - все поля обязательны
type DocumentRequired = Required<DocumentPartial>
```

### Type Guards

```tsx
function isDocumentWithFiles(doc: Document | DocumentWithFiles): doc is DocumentWithFiles {
  return 'document_files' in doc
}

// Использование
if (isDocumentWithFiles(document)) {
  // TypeScript знает, что document.document_files существует
  console.log(document.document_files.length)
}
```

---

## 📊 Метрики

**До рефакторинга:**
- Все типы в одном файле (database.ts, 2093 строки)
- Нужно вручную создавать расширенные типы
- Сложно найти нужный тип
- Дублирование кода

**После рефакторинга:**
- Организованная структура по сущностям
- Готовые расширенные типы (With*, Full, Create, Update)
- Легко найти и использовать
- Централизованное управление

---

## 🔗 См. также

- [Services](../../services/README.md) - использование типов в сервисах
- [Supabase Type Generation](https://supabase.com/docs/guides/api/generating-types)
- [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
