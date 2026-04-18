const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
    const redirectUri = (body?.redirect_uri as string | undefined) || Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')
    if (!clientId) throw new Error('Не настроен GOOGLE_OAUTH_CLIENT_ID в Supabase Secrets')
    if (!redirectUri) throw new Error('redirect_uri не указан (ни в body, ни в секретах)')

    const scopes = [
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ')

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scopes,
      access_type: 'offline',
      prompt: 'consent',
    })
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    return new Response(JSON.stringify({ auth_url: authUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
