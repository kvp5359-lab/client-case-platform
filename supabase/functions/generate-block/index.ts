import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = 'https://zjatohckcpiqmxkmfxbs.supabase.co'

interface ContextDefinition {
  id: string
  name: string
  type: string | null
}

interface ContextValue {
  type: 'text' | 'screenshot' | 'table' | 'pdf'
  content?: unknown
  file_path?: string
  name?: string
}

// Контекст конкретного блока (из таблицы docbuilder_block_context)
interface BlockContextItem {
  id: string
  type: 'text' | 'screenshot' | 'table' | 'pdf'
  content?: unknown
  file_path?: string | null
  slot_name?: string | null
  order_index: number
}

interface GenerateRequest {
  api_key?: string
  model?: string
  base_url?: string
  block_title: string
  block_prompt: string
  validation_prompt?: string | null
  default_validation_prompt?: string | null
  validation_system_prompt?: string | null
  generation_system_prompt?: string | null
  primary_language: string
  secondary_language: string
  target_language: 'primary' | 'secondary'
  issues_language?: string  // язык для замечаний (обычно secondary)
  project_name: string
  project_description?: string | null
  general_context?: Record<string, ContextValue | ContextValue[]>
  context_definitions?: ContextDefinition[]
  block_context?: BlockContextItem[]  // контекст конкретного блока
  document_summary?: string | null
  existing_content?: string
  refinement?: string
  current_content?: string
  refinement_system_prompt?: string
}

function buildDefMap(definitions: ContextDefinition[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const def of definitions) map[def.id] = def.name
  return map
}

function resolveInlineRefs(text: string, defMap: Record<string, string>): string {
  return text.replace(/\{\{([a-f0-9-]{36})\}\}/g, (_m, id: string) => {
    const name = defMap[id]
    return name ? `[см. контекст: ${name}]` : ''
  })
}

const LANG_NAMES: Record<string, string> = {
  ru: 'русском',
  es: 'испанском',
  en: 'английском',
}

function getFileUrl(filePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/docbuilder/${filePath}`
}

async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Не удалось скачать файл: ${url}`)
  const buffer = await res.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function buildSystemPrompt(req: GenerateRequest): string {
  const lang = req.target_language === 'primary' ? req.primary_language : req.secondary_language
  const langName = LANG_NAMES[lang] ?? lang
  const issuesLang = req.issues_language ?? lang
  const issuesLangName = LANG_NAMES[issuesLang] ?? issuesLang
  const issuesSameAsContent = issuesLang === lang

  const isRefinement = !!(req.refinement && req.current_content)

  const defaultRefinementPrompt = `РЕЖИМ УТОЧНЕНИЯ:
Тебе передан текущий текст раздела и уточнение от пользователя.
Внеси изменения согласно уточнению. Если уточнение подразумевает точечную правку (замени, удали, добавь) — сохрани остальной текст дословно. Если уточнение подразумевает переработку (перепиши, сделай короче, измени стиль) — можешь переписать текст, используя контекст проекта.`

  const refinementBlock = isRefinement
    ? `\n\n${req.refinement_system_prompt || defaultRefinementPrompt}`
    : ''

  const languageRequirement = `КРИТИЧЕСКИ ВАЖНО:
- Текст ОБЯЗАТЕЛЬНО пиши ТОЛЬКО на ${langName} языке (код языка: ${lang}).
Это требование имеет наивысший приоритет и не может быть нарушено ни при каких обстоятельствах — даже если инструкции к разделу написаны на другом языке.`

  const customGenerationSystemPrompt = req.generation_system_prompt?.trim() || ''
  if (customGenerationSystemPrompt) {
    return `${customGenerationSystemPrompt}${refinementBlock}\n\n${languageRequirement}`
  }

  return `Ты профессиональный бизнес-консультант и автор документов. Твоя задача — писать чёткий, структурированный и убедительный текст для бизнес-документов.
${refinementBlock}
Правила написания текста:
- Текст должен быть профессиональным, конкретным и по делу
- Используй данные и цифры из предоставленного контекста
- Не добавляй заголовки — только основной текст раздела
- Не повторяй очевидное, не добавляй "воду"
- Объём: ёмко и достаточно для раздела бизнес-плана (обычно 150–400 слов)
- Для выделения используй **жирный текст** (markdown), НИКОГДА не используй HTML-теги (<b>, <i>, <br> и т.д.)

Верни ТОЛЬКО текст раздела, без JSON-обёртки, без пояснений. Просто чистый текст.

${languageRequirement}`
}

type ContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ImageBlockParam
  | Anthropic.Base64PDFSource

async function buildUserContent(req: GenerateRequest): Promise<ContentBlock[]> {
  // РЕЖИМ УТОЧНЕНИЯ: только текущий текст + контекст блока + уточнение
  if (req.refinement && req.current_content) {
    const content: ContentBlock[] = []
    const lines: string[] = []

    const lang = req.target_language === 'primary' ? req.primary_language : req.secondary_language
    const langName = LANG_NAMES[lang] ?? lang

    lines.push(`### Текущий текст раздела «${req.block_title}»:`)
    lines.push(req.current_content)

    // Контекст блока (тексты и таблицы)
    const blockCtx = (req.block_context ?? []).sort((a, b) => a.order_index - b.order_index)
    const bcTextTable = blockCtx.filter((c) => c.type === 'text' || c.type === 'table')
    const bcScreenshots = blockCtx.filter((c) => c.type === 'screenshot')
    const bcPdfs = blockCtx.filter((c) => c.type === 'pdf')

    if (bcTextTable.length > 0) {
      lines.push('\n### Контекст раздела:')
      for (const item of bcTextTable) {
        if (item.type === 'text' && item.content) {
          lines.push(`${item.content}`)
        } else if (item.type === 'table' && item.content) {
          lines.push(`(таблица):\n${JSON.stringify(item.content, null, 2)}`)
        }
      }
    }

    lines.push(`\n### Уточнение от пользователя:`)
    lines.push(req.refinement)
    lines.push(`\nВерни текст на ${langName} языке.`)

    content.push({ type: 'text', text: lines.join('\n') })

    // Скриншоты блока
    for (const item of bcScreenshots) {
      if (!item.file_path) continue
      content.push({ type: 'text', text: `[Скриншот к разделу]:` })
      content.push({
        type: 'image',
        source: { type: 'url', url: getFileUrl(item.file_path) },
      })
    }

    // PDF блока
    for (const item of bcPdfs) {
      if (!item.file_path) continue
      const fileName = (item.content as { name?: string } | null)?.name ?? item.file_path
      content.push({ type: 'text', text: `[PDF к разделу — ${fileName}]:` })
      try {
        const base64 = await fetchAsBase64(getFileUrl(item.file_path))
        content.push({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as unknown as ContentBlock)
      } catch (err) {
        content.push({ type: 'text', text: `(не удалось загрузить PDF: ${err})` })
      }
    }

    return content
  }

  // ОБЫЧНАЯ ГЕНЕРАЦИЯ: полный контекст
  const content: ContentBlock[] = []
  const lines: string[] = []

  const defMap = buildDefMap(req.context_definitions ?? [])

  lines.push(`## Документ: ${req.project_name}`)
  if (req.project_description) {
    lines.push(`Описание: ${req.project_description}`)
  }

  // general_context: значение может быть одиночным объектом или массивом (для screenshot/pdf)
  const gc = req.general_context ?? {}

  // Нормализуем: раскрываем всё в плоский список пар [id, ContextValue]
  const gcFlat: [string, ContextValue][] = []
  for (const [id, entry] of Object.entries(gc)) {
    if (!entry) continue
    if (Array.isArray(entry)) {
      for (const v of entry) gcFlat.push([id, v])
    } else {
      gcFlat.push([id, entry])
    }
  }

  const textTableEntries = gcFlat.filter(([, v]) => v.type === 'text' || v.type === 'table')
  const screenshotEntries = gcFlat.filter(([, v]) => v.type === 'screenshot')
  const pdfEntries = gcFlat.filter(([, v]) => v.type === 'pdf')

  // block_context: контекст конкретного блока (скриншоты, PDF, текст прикреплённые к блоку)
  const blockCtx = (req.block_context ?? []).sort((a, b) => a.order_index - b.order_index)
  const bcTextTable = blockCtx.filter((c) => c.type === 'text' || c.type === 'table')
  const bcScreenshots = blockCtx.filter((c) => c.type === 'screenshot')
  const bcPdfs = blockCtx.filter((c) => c.type === 'pdf')

  if (req.document_summary) {
    lines.push('\n### Сводка документов клиента:')
    lines.push(req.document_summary)
  }

  if (textTableEntries.length > 0) {
    lines.push('\n### Контекст проекта:')
    for (const [id, val] of textTableEntries) {
      const name = defMap[id] ?? id
      if (val.type === 'text' && val.content) {
        lines.push(`**${name}:**\n${val.content}`)
      } else if (val.type === 'table' && val.content) {
        lines.push(`**${name}** (таблица):\n${JSON.stringify(val.content, null, 2)}`)
      }
    }
  }

  // Текст и таблицы из контекста блока
  if (bcTextTable.length > 0) {
    lines.push('\n### Дополнительный контекст раздела:')
    for (const item of bcTextTable) {
      if (item.type === 'text' && item.content) {
        lines.push(`${item.content}`)
      } else if (item.type === 'table' && item.content) {
        lines.push(`(таблица):\n${JSON.stringify(item.content, null, 2)}`)
      }
    }
  }

  if (req.existing_content) {
    lines.push('\n### Уже написанные разделы документа (для связности):')
    lines.push(req.existing_content.slice(0, 2000))
  }

  lines.push(`\n### Твоя задача:`)
  lines.push(`Напиши раздел «${req.block_title}».`)
  lines.push(`\nИнструкция по написанию текста: ${resolveInlineRefs(req.block_prompt, defMap)}`)

  if (req.refinement) {
    lines.push(`\n### Уточнение от пользователя:`)
    lines.push(req.refinement)
  }

  const totalScreenshots = screenshotEntries.length + bcScreenshots.length
  const totalPdfs = pdfEntries.length + bcPdfs.length

  if (totalScreenshots > 0) {
    lines.push('\n### Прикреплённые скриншоты (см. ниже):')
  }
  if (totalPdfs > 0) {
    lines.push('\n### Прикреплённые PDF-документы (см. ниже):')
  }

  content.push({ type: 'text', text: lines.join('\n') })

  // Скриншоты из general_context
  for (const [id, val] of screenshotEntries) {
    if (!val.file_path) continue
    const name = defMap[id] ?? id
    content.push({ type: 'text', text: `[${name}]:` })
    content.push({
      type: 'image',
      source: { type: 'url', url: getFileUrl(val.file_path) },
    })
  }

  // Скриншоты из контекста блока
  for (const item of bcScreenshots) {
    if (!item.file_path) continue
    content.push({ type: 'text', text: `[Скриншот к разделу]:` })
    content.push({
      type: 'image',
      source: { type: 'url', url: getFileUrl(item.file_path) },
    })
  }

  // PDF из general_context
  for (const [id, val] of pdfEntries) {
    if (!val.file_path) continue
    const name = defMap[id] ?? id
    const fileName = val.name ?? val.file_path
    content.push({ type: 'text', text: `[${name} — ${fileName}]:` })
    try {
      const base64 = await fetchAsBase64(getFileUrl(val.file_path))
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      } as unknown as ContentBlock)
    } catch (err) {
      content.push({ type: 'text', text: `(не удалось загрузить PDF: ${err})` })
    }
  }

  // PDF из контекста блока
  for (const item of bcPdfs) {
    if (!item.file_path) continue
    const fileName = (item.content as { name?: string } | null)?.name ?? item.file_path
    content.push({ type: 'text', text: `[PDF к разделу — ${fileName}]:` })
    try {
      const base64 = await fetchAsBase64(getFileUrl(item.file_path))
      content.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: base64 },
      } as unknown as ContentBlock)
    } catch (err) {
      content.push({ type: 'text', text: `(не удалось загрузить PDF: ${err})` })
    }
  }

  return content
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: GenerateRequest = await req.json()

    console.log('generate-block params:', {
      target_language: body.target_language,
      primary_language: body.primary_language,
      secondary_language: body.secondary_language,
      issues_language: body.issues_language,
      block_context_count: body.block_context?.length ?? 0,
      has_refinement: !!body.refinement,
      has_current_content: !!body.current_content,
      current_content_length: body.current_content?.length ?? 0,
      refinement_text: body.refinement ?? null,
    })

    const apiKey = body.api_key || Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('API key not provided')

    const model = body.model || 'claude-sonnet-4-6'
    const useOpenAI = !!body.base_url
    const userContent = await buildUserContent(body)
    const systemPrompt = buildSystemPrompt(body)

    // Конвертация Anthropic ContentBlock[] в OpenAI multimodal формат
    async function toOpenAIContent(msg: string | ContentBlock[]): Promise<string | Array<{type: string; text?: string; image_url?: {url: string}}>> {
      if (!Array.isArray(msg)) return msg
      const hasImages = msg.some((c) => c.type === 'image')
      if (!hasImages) {
        return msg.filter((c) => c.type === 'text').map((c) => (c as {text: string}).text).join('\n')
      }
      // Multimodal: текст + изображения (конвертируем в base64 для совместимости)
      const parts: Array<{type: string; text?: string; image_url?: {url: string}}> = []
      for (const block of msg) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: (block as {text: string}).text })
        } else if (block.type === 'image') {
          const src = (block as {source: {type: string; url?: string}}).source
          if (src.url) {
            try {
              const base64 = await fetchAsBase64(src.url)
              parts.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } })
            } catch {
              parts.push({ type: 'text', text: `[Изображение недоступно: ${src.url}]` })
            }
          }
        }
      }
      return parts
    }

    // Универсальная функция вызова AI
    async function callAI(sysPrompt: string, userMsg: string | ContentBlock[], maxTokens = 2048, reasoningEffort: string | null = 'low'): Promise<string> {
      if (useOpenAI) {
        // OpenAI-совместимый формат (OpenRouter и др.)
        const openAIContent = await toOpenAIContent(userMsg)
        const isGemini = body.base_url?.includes('generativelanguage.googleapis.com')
        const reqBody: Record<string, unknown> = {
          model,
          messages: [
            { role: 'system', content: sysPrompt },
            { role: 'user', content: openAIContent },
          ],
        }
        if (isGemini) {
          // Gemini 2.5: reasoning_effort управляет thinking (null = без ограничений)
          if (reasoningEffort) reqBody.reasoning_effort = reasoningEffort
        } else {
          reqBody.max_tokens = maxTokens
        }
        const res = await fetch(`${body.base_url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(reqBody),
        })
        if (!res.ok) {
          const errBody = await res.text()
          throw new Error(`API error ${res.status}: ${errBody}`)
        }
        const data = await res.json()
        return data.choices?.[0]?.message?.content ?? ''
      } else {
        // Anthropic SDK
        const client = new Anthropic({ apiKey })
        const message = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system: sysPrompt,
          messages: [{ role: 'user', content: userMsg as Anthropic.MessageParam['content'] }],
        })
        return message.content
          .filter((c) => c.type === 'text')
          .map((c) => (c as { type: 'text'; text: string }).text)
          .join('')
      }
    }

    // === ЭТАП 1: ГЕНЕРАЦИЯ ТЕКСТА ===
    console.log('=== ЭТАП 1: ГЕНЕРАЦИЯ ===')
    console.log('System prompt:', systemPrompt)
    console.log('User content (text parts):', userContent.filter(c => c.type === 'text').map(c => (c as {text: string}).text).join('\n---\n'))
    console.log('User content blocks count:', userContent.length, '(images/pdfs:', userContent.filter(c => c.type !== 'text').length, ')')

    const startTime = Date.now()
    const raw = await callAI(systemPrompt, userContent, 4096)
    const generateDurationMs = Date.now() - startTime
    console.log('Generation duration:', generateDurationMs, 'ms')
    console.log('Raw AI response (first 500 chars):', raw.slice(0, 500))

    // Контент — чистый текст (без JSON-обёртки)
    let content = raw.trim()
    // Fallback: если AI всё же вернул JSON — извлекаем content
    if (content.startsWith('{')) {
      try {
        let cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/g, '').trim()
        const braceIdx = cleaned.indexOf('{')
        if (braceIdx > 0) cleaned = cleaned.slice(braceIdx)
        const lastBrace = cleaned.lastIndexOf('}')
        if (lastBrace >= 0 && lastBrace < cleaned.length - 1) cleaned = cleaned.slice(0, lastBrace + 1)
        const parsed = JSON.parse(cleaned)
        if ('content' in parsed) content = parsed.content ?? ''
      } catch { /* оставляем как есть */ }
    }

    // === ЭТАП 2: ПРОВЕРКА (отдельный AI-вызов) ===
    console.log('\n=== ЭТАП 2: ПРОВЕРКА ===')
    // Собираем финальный промпт проверки: default + блочный
    const defaultVP = body.default_validation_prompt?.trim() ?? ''
    const blockVP = body.validation_prompt?.trim() ?? ''
    const hasValidation = defaultVP || blockVP
    console.log('default_validation_prompt:', defaultVP || '(пусто)')
    console.log('block validation_prompt:', blockVP || '(пусто)')
    console.log('hasValidation:', hasValidation)

    let issues: string[] = []
    let validationDurationMs = 0

    if (hasValidation) {
      const defMap = buildDefMap(body.context_definitions ?? [])
      const issuesLang = body.issues_language ?? (body.target_language === 'primary' ? body.primary_language : body.secondary_language)
      const issuesLangName = LANG_NAMES[issuesLang] ?? issuesLang

      // Формируем промпт проверки
      let validationInstruction = ''
      if (defaultVP && blockVP) {
        validationInstruction = `${resolveInlineRefs(defaultVP, defMap)}\n\nДополнительные требования к этому разделу:\n${resolveInlineRefs(blockVP, defMap)}`
      } else {
        validationInstruction = resolveInlineRefs(defaultVP || blockVP, defMap)
      }

      const defaultValidationSystemPrompt = `Тебе дан текст раздела бизнес-документа, задание по которому он был написан, и инструкция по проверке.

ГЛАВНОЕ ПРАВИЛО: выполняй ТОЛЬКО то, что написано в "Инструкции по проверке". Не придумывай свои проверки. Не ищи проблемы, которые не указаны в инструкции. Делай строго то, что просят.

Формат ответа — строго JSON-массив строк, без пояснений вне JSON:
["пункт 1", "пункт 2"]

Если по результатам проверки нечего сообщить — верни пустой массив: []`

      const customValidationSystemPrompt = body.validation_system_prompt?.trim() || ''
      const validationSystemPrompt = customValidationSystemPrompt || defaultValidationSystemPrompt

      // Собираем контексты из всех промптов: block_prompt + validation промпты
      const allContextIds = new Set<string>()
      const uuidRegex = /\{\{([a-f0-9-]{36})\}\}/g
      let uuidMatch: RegExpExecArray | null
      const allPromptsText = (body.block_prompt || '') + ' ' + (defaultVP || '') + ' ' + (blockVP || '')
      while ((uuidMatch = uuidRegex.exec(allPromptsText)) !== null) {
        allContextIds.add(uuidMatch[1])
      }

      // Строим multimodal content для проверки (тексты, таблицы, скриншоты, PDF)
      const valContent: ContentBlock[] = []
      const valLines: string[] = []

      valLines.push(`### Задание, по которому был написан текст:`)
      valLines.push(resolveInlineRefs(body.block_prompt, defMap))
      valLines.push(`\n### Написанный текст раздела «${body.block_title}»:`)
      valLines.push(content)
      valLines.push(`\n### Инструкция по проверке:`)
      valLines.push(validationInstruction)

      // Добавляем данные контекстов (тексты, таблицы, скриншоты, PDF)
      if (allContextIds.size > 0) {
        const gc = body.general_context ?? {}
        const textParts: string[] = []
        const screenshots: { name: string; url: string }[] = []
        const pdfs: { name: string; filePath: string }[] = []

        for (const ctxId of allContextIds) {
          const entry = gc[ctxId]
          if (!entry) continue
          const items = Array.isArray(entry) ? entry : [entry]
          for (const val of items) {
            const name = defMap[ctxId] ?? ctxId
            if (val.type === 'text' && val.content) {
              textParts.push(`**${name}:**\n${val.content}`)
            } else if (val.type === 'table' && val.content) {
              textParts.push(`**${name}** (таблица):\n${JSON.stringify(val.content, null, 2)}`)
            } else if (val.type === 'screenshot' && val.file_path) {
              screenshots.push({ name, url: getFileUrl(val.file_path) })
            } else if (val.type === 'pdf' && val.file_path) {
              pdfs.push({ name, filePath: val.file_path })
            }
          }
        }

        if (textParts.length > 0 || screenshots.length > 0 || pdfs.length > 0) {
          valLines.push(`\n### Прикреплённые контексты:`)
        }
        if (textParts.length > 0) {
          valLines.push(...textParts)
        }

        // Добавляем текстовую часть
        valContent.push({ type: 'text', text: valLines.join('\n') })

        // Скриншоты
        for (const ss of screenshots) {
          valContent.push({ type: 'text', text: `[Скриншот: ${ss.name}]:` })
          valContent.push({ type: 'image', source: { type: 'url', url: ss.url } })
        }

        // PDF
        for (const pdf of pdfs) {
          valContent.push({ type: 'text', text: `[PDF: ${pdf.name}]:` })
          try {
            const base64 = await fetchAsBase64(getFileUrl(pdf.filePath))
            valContent.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            } as unknown as ContentBlock)
          } catch (err) {
            valContent.push({ type: 'text', text: `(не удалось загрузить PDF: ${err})` })
          }
        }
      } else {
        valContent.push({ type: 'text', text: valLines.join('\n') })
      }

      console.log('Validation system prompt:', validationSystemPrompt)
      console.log('Validation context IDs:', [...allContextIds])
      console.log('Validation content blocks:', valContent.length, '(text:', valContent.filter(c => c.type === 'text').length, 'images:', valContent.filter(c => c.type === 'image').length, 'docs:', valContent.filter(c => (c as unknown as {type: string}).type === 'document').length, ')')

      try {
        const valStart = Date.now()
        const valRaw = await callAI(validationSystemPrompt, valContent, 2048, 'low')
        validationDurationMs = Date.now() - valStart
        console.log('Validation duration:', validationDurationMs, 'ms')
        console.log('Validation raw response:', valRaw)

        // Парсим JSON-массив
        const arrMatch = valRaw.match(/\[[\s\S]*\]/)
        if (arrMatch) {
          const parsed = JSON.parse(arrMatch[0])
          if (Array.isArray(parsed)) issues = parsed.filter((s: unknown) => typeof s === 'string' && s.trim())
        }
      } catch {
        // Если проверка не удалась — оставляем пустой массив
      }

      // Перевод замечаний если нужно
      const contentLang = body.target_language === 'primary' ? body.primary_language : body.secondary_language
      if (issues.length > 0 && issuesLang !== contentLang) {
        try {
          const issuesText = issues.map((s, i) => `${i + 1}. ${s}`).join('\n')
          const translateRaw = await callAI(
            `Ты переводчик. Переведи каждый пункт списка замечаний на ${issuesLangName} язык. Верни строго JSON-массив строк, без пояснений: ["пункт 1", "пункт 2"]`,
            issuesText, 1024, 'none'
          )
          const tArrMatch = translateRaw.match(/\[[\s\S]*\]/)
          if (tArrMatch) {
            const translated = JSON.parse(tArrMatch[0])
            if (Array.isArray(translated)) issues = translated
          }
        } catch { /* оставляем оригинал */ }
      }
    }

    console.log('\n=== РЕЗУЛЬТАТ ===')
    console.log('Content (first 300 chars):', content.slice(0, 300))
    console.log('Issues count:', issues.length)
    console.log('Issues:', issues)
    console.log('Generation time:', generateDurationMs, 'ms | Validation time:', validationDurationMs, 'ms')

    const isGemini = body.base_url?.includes('generativelanguage.googleapis.com')
    const reasoningEffort = isGemini ? 'low' : null

    return new Response(
      JSON.stringify({
        content, issues, model,
        duration_ms: generateDurationMs,
        validation_duration_ms: validationDurationMs || undefined,
        reasoning_effort: reasoningEffort,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('generate-block error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
