import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = 'https://zjatohckcpiqmxkmfxbs.supabase.co'

interface OcrRequest {
  action: 'ocr'
  vision_api_key: string
  file_path: string
  file_type: string
  document_id: string
}

interface SummarizeRequest {
  action: 'summarize'
  anthropic_api_key: string
  model?: string
  project_name: string
  analysis_prompt: string
  documents: { file_name: string; ocr_text: string }[]
}

type RequestBody = OcrRequest | SummarizeRequest

function getFileUrl(filePath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/docbuilder/${filePath}`
}

async function fetchAsBase64(url: string): Promise<string> {
  console.log('Fetching file:', url)
  const res = await fetch(url)
  console.log('File fetch status:', res.status, res.statusText)
  if (!res.ok) throw new Error(`Не удалось скачать файл (${res.status}): ${url}`)
  const buffer = await res.arrayBuffer()
  console.log('File size (bytes):', buffer.byteLength)
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function runOcr(body: OcrRequest): Promise<{ text: string }> {
  const fileUrl = getFileUrl(body.file_path)
  const base64 = await fetchAsBase64(fileUrl)

  const isPdf = body.file_type === 'application/pdf'

  let requestBody: unknown

  if (isPdf) {
    requestBody = {
      requests: [{
        inputConfig: {
          content: base64,
          mimeType: 'application/pdf',
        },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
        pages: [1, 2, 3, 4, 5], // Vision API: максимум 5 страниц за вызов
      }],
    }

    console.log('Calling Vision API files:annotate, key prefix:', body.vision_api_key.slice(0, 8))
    const res = await fetch(
      `https://vision.googleapis.com/v1/files:annotate?key=${body.vision_api_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    )
    console.log('Vision API response status:', res.status)
    const rawText = await res.text()
    console.log('Vision API raw response (first 500 chars):', rawText.slice(0, 500))
    if (!res.ok) {
      throw new Error(`Vision API error (${res.status}): ${rawText}`)
    }
    const data = JSON.parse(rawText)
    const responses = data.responses ?? []
    const text = responses
      .flatMap((r: { responses?: { fullTextAnnotation?: { text?: string } }[] }) =>
        (r.responses ?? []).map((p) => p.fullTextAnnotation?.text ?? '')
      )
      .join('\n')
    return { text }
  } else {
    requestBody = {
      requests: [{
        image: { content: base64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      }],
    }

    console.log('Calling Vision API images:annotate, key prefix:', body.vision_api_key.slice(0, 8))
    const res = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${body.vision_api_key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      }
    )
    console.log('Vision API response status:', res.status)
    const rawText = await res.text()
    console.log('Vision API raw response (first 500 chars):', rawText.slice(0, 500))
    if (!res.ok) {
      throw new Error(`Vision API error (${res.status}): ${rawText}`)
    }
    const data = JSON.parse(rawText)
    const text = data.responses?.[0]?.fullTextAnnotation?.text ?? ''
    return { text }
  }
}

async function runSummarize(body: SummarizeRequest): Promise<{ summary: string }> {
  const client = new Anthropic({ apiKey: body.anthropic_api_key })
  const model = body.model ?? 'claude-sonnet-4-6'

  const docsText = body.documents
    .map((d, i) => `### Документ ${i + 1}: ${d.file_name}\n\n${d.ocr_text}`)
    .join('\n\n---\n\n')

  const userMessage = `Проект: ${body.project_name}\n\nНиже представлены распознанные тексты документов клиента:\n\n${docsText}\n\n---\n\n${body.analysis_prompt}`

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    system: 'Ты профессиональный бизнес-аналитик. Твоя задача — анализировать документы клиента и составлять структурированные сводки для использования при написании бизнес-плана. Отвечай только текстом сводки, без вводных фраз.',
    messages: [{ role: 'user', content: userMessage }],
  })

  const summary = message.content
    .filter((c) => c.type === 'text')
    .map((c) => (c as { type: 'text'; text: string }).text)
    .join('')

  return { summary }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: RequestBody = await req.json()

    if (body.action === 'ocr') {
      const result = await runOcr(body)
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    if (body.action === 'summarize') {
      const result = await runSummarize(body)
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    throw new Error('Unknown action')
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('analyze-documents error:', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
