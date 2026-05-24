import { corsHeadersFor } from "../_shared/edge.ts"

Deno.serve(async (req: Request) => {
  const corsHeaders = corsHeadersFor(req)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json() as { url: string }
    if (!url) throw new Error('url is required')

    const res = await fetch(url)
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`)

    const buffer = await res.arrayBuffer()
    const contentType = res.headers.get('content-type') ?? 'image/png'

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
