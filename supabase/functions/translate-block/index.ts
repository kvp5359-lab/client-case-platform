import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranslateRequest {
  text: string
  source_language: string
  target_language: string
  block_title: string
  api_key?: string
  model?: string
  base_url?: string
  system_prompt?: string
}

const LANG_NAMES: Record<string, string> = {
  ru: 'русский',
  es: 'испанский',
  en: 'английский',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: TranslateRequest = await req.json()

    const apiKey = body.api_key || Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) throw new Error('API key not provided')

    const model = body.model || 'claude-sonnet-4-6'
    const useOpenAI = !!body.base_url

    const sourceName = LANG_NAMES[body.source_language] ?? body.source_language
    const targetName = LANG_NAMES[body.target_language] ?? body.target_language

    const defaultPrompt = `Ты профессиональный переводчик бизнес-документов.
Переводи точно и профессионально, сохраняя стиль, структуру и все данные.
Не добавляй пояснений, заголовков, подзаголовков, меток или любого другого текста, которого нет в оригинале — только точный перевод исходного текста.`

    const sysPrompt = body.system_prompt || defaultPrompt

    const userMsg = `Переведи следующий текст с ${sourceName} на ${targetName}.
ВАЖНО: переведи ТОЛЬКО текст ниже. Не добавляй заголовок, название раздела или любой другой текст, которого нет в оригинале.

Текст:
${body.text}`

    let translated: string

    if (useOpenAI) {
      const isGemini = body.base_url?.includes('generativelanguage.googleapis.com')
      const reqBody: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: userMsg },
        ],
      }
      if (isGemini) {
        reqBody.reasoning_effort = 'none'  // перевод — простая задача, thinking не нужен
      } else {
        reqBody.max_tokens = 4096
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
      translated = data.choices?.[0]?.message?.content ?? ''
    } else {
      const client = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        system: sysPrompt,
        messages: [{ role: 'user', content: userMsg }],
      })
      translated = message.content
        .filter((c) => c.type === 'text')
        .map((c) => (c as { type: 'text'; text: string }).text)
        .join('')
    }

    return new Response(
      JSON.stringify({ text: translated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('translate-block error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
