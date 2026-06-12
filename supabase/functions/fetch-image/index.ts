import { corsHeadersFor } from "../_shared/edge.ts"

// Прокси для картинок (используется внешними приложениями на общей БД).
// Защита от SSRF: только http/https, запрет приватных/служебных адресов,
// редиректы валидируются вручную, отдаём только image/*.

const MAX_REDIRECTS = 3
const MAX_BYTES = 15 * 1024 * 1024 // 15 МБ

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) {
    return true
  }
  // IPv6 loopback/link-local/unique-local
  if (h.includes(':')) {
    const v6 = h.replace(/^\[|\]$/g, '')
    return v6 === '::1' || v6.startsWith('fe80:') || v6.startsWith('fc') || v6.startsWith('fd') || v6 === '::'
  }
  // IPv4 literal
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if (a === 10 || a === 127 || a === 0) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true // link-local / cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
  return false
}

function validateUrl(raw: string): URL {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('Invalid url')
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') {
    throw new Error('Only http(s) urls are allowed')
  }
  if (isPrivateHost(u.hostname)) {
    throw new Error('Host not allowed')
  }
  return u
}

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json() as { url: string }
    if (!url) throw new Error('url is required')

    let target = validateUrl(url)
    let res: Response | null = null
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target.toString(), { redirect: 'manual' })
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) throw new Error('Redirect without location')
        await res.body?.cancel()
        target = validateUrl(new URL(loc, target).toString())
        res = null
        continue
      }
      break
    }
    if (!res) throw new Error('Too many redirects')
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.startsWith('image/')) {
      await res.body?.cancel()
      throw new Error('Target is not an image')
    }

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) {
      throw new Error('Image too large')
    }

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
      },
      status: 200,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
