/**
 * Сервис для AI-ассистента проекта (SSE streaming)
 * Поддерживает три источника контекста: переписка, анкеты, документы
 */

import { supabase } from '@/lib/supabase'
import type { ProjectMessage } from './messengerService'
import { parseSSEStream } from '@/utils/sseParser'
import type { SearchSource } from './knowledgeSearchService'

// =====================================================
// Типы
// =====================================================

/** @deprecated Используй SearchSource из knowledgeSearchService */
export type KnowledgeSourceInResponse = SearchSource

export interface MessengerAiStreamCallbacks {
  onText: (chunk: string) => void
  onDone: (fullAnswer: string) => void
  onError: (error: string) => void
  onSources?: (sources: SearchSource[]) => void
}

export interface FormFieldForAi {
  sectionName: string | null
  fieldName: string
  value: string | null
}

export interface FormKitForAi {
  name: string
  fields: FormFieldForAi[]
}

export interface DocumentForAi {
  id: string
  name: string
  textContent: string | null
  kitName?: string | null
  folderName?: string | null
  folderSortOrder?: number | null
  sortOrder?: number
  statusId?: string | null
}

export interface AiSources {
  clientMessages: boolean
  teamMessages: boolean
  formData: boolean
  documents: boolean
  /** 'project' = БЗ проекта, 'all' = вся БЗ, null = выключено */
  knowledge: 'project' | 'all' | null
}

// =====================================================
// Форматирование контекста
// =====================================================

const MAX_MESSAGES = 200
const MAX_CONTEXT_LENGTH = 200_000 // Серверный лимит — 200K символов
const MAX_DOC_LENGTH = 30_000 // Макс. длина текста одного документа

/**
 * Форматирует массив сообщений переписки в текст для AI-контекста.
 */
export function formatMessagesForAi(messages: ProjectMessage[]): string {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )
  const recent = sorted.slice(-MAX_MESSAGES)

  const lines: string[] = []
  for (const msg of recent) {
    const date = new Date(msg.created_at)
    const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
    const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    const role = msg.sender_role ? ` (${msg.sender_role})` : ''
    const source = msg.source === 'telegram' ? ' [Telegram]' : ''
    // Собираем транскрипции аудиовложений
    const transcriptions = msg.attachments
      ?.filter((a) => a.transcription && a.mime_type?.startsWith('audio/'))
      .map((a) => a.transcription)

    const contentParts = [msg.content]
    if (transcriptions && transcriptions.length > 0) {
      contentParts.push(`[Аудиосообщение: ${transcriptions.join(' ')}]`)
    }

    lines.push(
      `[${dateStr} ${timeStr}] ${msg.sender_name}${role}${source}: ${contentParts.join(' ')}`,
    )
  }

  return lines.join('\n')
}

/**
 * Форматирует данные анкет для AI-контекста.
 */
export function formatFormDataForAi(formKits: FormKitForAi[]): string {
  const parts: string[] = []

  for (const kit of formKits) {
    const lines: string[] = []
    let currentSection = ''

    for (const field of kit.fields) {
      if (!field.value) continue

      if (field.sectionName && field.sectionName !== currentSection) {
        currentSection = field.sectionName
        lines.push(`--- ${currentSection} ---`)
      }

      lines.push(`${field.fieldName}: ${field.value}`)
    }

    if (lines.length > 0) {
      parts.push(`Анкета: "${kit.name}"\n${lines.join('\n')}`)
    }
  }

  return parts.join('\n\n')
}

/**
 * Форматирует документы проекта для AI-контекста.
 */
export function formatDocumentsForAi(documents: DocumentForAi[]): string {
  const parts: string[] = []

  for (const doc of documents) {
    if (!doc.textContent) continue
    const text =
      doc.textContent.length > MAX_DOC_LENGTH
        ? doc.textContent.slice(0, MAX_DOC_LENGTH) + '\n... (текст обрезан)'
        : doc.textContent
    parts.push(`--- ${doc.name} ---\n${text}`)
  }

  return parts.join('\n\n')
}

/**
 * Собирает итоговый контекст из выбранных источников.
 * Обрезает до MAX_CONTEXT_LENGTH.
 */
export function buildProjectContext(options: {
  sources: AiSources
  clientMessages?: ProjectMessage[]
  teamMessages?: ProjectMessage[]
  formKits?: FormKitForAi[]
  documents?: DocumentForAi[]
}): string {
  const { sources, clientMessages, teamMessages, formKits, documents } = options
  const blocks: string[] = []

  if (sources.clientMessages && clientMessages && clientMessages.length > 0) {
    const formatted = formatMessagesForAi(clientMessages)
    if (formatted) {
      blocks.push(`== ПЕРЕПИСКА С КЛИЕНТАМИ (${clientMessages.length} сообщ.) ==\n${formatted}`)
    }
  }

  if (sources.teamMessages && teamMessages && teamMessages.length > 0) {
    const formatted = formatMessagesForAi(teamMessages)
    if (formatted) {
      blocks.push(`== ПЕРЕПИСКА С КОМАНДОЙ (${teamMessages.length} сообщ.) ==\n${formatted}`)
    }
  }

  if (sources.formData && formKits && formKits.length > 0) {
    const formatted = formatFormDataForAi(formKits)
    if (formatted) {
      blocks.push(`== АНКЕТЫ ==\n${formatted}`)
    }
  }

  if (sources.documents && documents && documents.length > 0) {
    const docsWithText = documents.filter((d) => d.textContent)
    if (docsWithText.length > 0) {
      const formatted = formatDocumentsForAi(docsWithText)
      if (formatted) {
        blocks.push(`== ДОКУМЕНТЫ (${docsWithText.length} шт.) ==\n${formatted}`)
      }
    }
  }

  const context = blocks.join('\n\n')
  if (context.length > MAX_CONTEXT_LENGTH) {
    throw new Error(
      `Слишком большой контекст (${Math.round(context.length / 1000)}K символов из ${MAX_CONTEXT_LENGTH / 1000}K допустимых). Отключите часть источников (документы, переписку или анкеты) и попробуйте снова.`,
    )
  }

  return context
}

// =====================================================
// Стриминг запроса к AI
// =====================================================

export async function streamMessengerAiChat(
  params: {
    workspace_id: string
    question: string
    context: string
    conversation_history?: Array<{ role: string; content: string }>
    file?: File
    /** UUID шаблона проекта — для RAG по БЗ проекта */
    knowledge_template_id?: string
    /** true — для RAG по всей БЗ workspace */
    knowledge_all?: boolean
  },
  callbacks: MessengerAiStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session?.access_token) {
    callbacks.onError('Необходима авторизация')
    return
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/chat-with-messages`

  const { file, ...jsonParams } = params
  let body: FormData | string
  const headers: Record<string, string> = {
    Authorization: `Bearer ${session.access_token}`,
    apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }

  if (file) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('data', JSON.stringify({ ...jsonParams, stream: true }))
    body = formData
  } else {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify({ ...jsonParams, stream: true })
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal,
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    callbacks.onError(errData.error || 'Ошибка AI')
    return
  }

  if (!response.body) {
    callbacks.onError('Response body is null')
    return
  }

  await parseSSEStream(response.body, (event) => {
    switch (event.type) {
      case 'text':
        callbacks.onText(event.data as string)
        break
      case 'done':
        callbacks.onDone((event.data as { answer: string }).answer)
        break
      case 'error':
        callbacks.onError((event.data as { error: string }).error)
        break
      case 'sources':
        callbacks.onSources?.((event.data as { sources: SearchSource[] }).sources)
        break
    }
  })
}
