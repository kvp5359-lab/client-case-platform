const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { code, redirect_uri } = await req.json()
    if (!code) throw new Error('No code provided')

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
    const redirectUri = (redirect_uri as string | undefined) || Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')
    if (!clientId || !clientSecret) throw new Error('Не настроены Google OAuth secrets')
    if (!redirectUri) throw new Error('redirect_uri не указан')

    console.log('[exchange] redirect_uri:', redirectUri)
    console.log('[exchange] client_id:', clientId.slice(0, 20) + '...')
    console.log('[exchange] code length:', String(code).length)

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokenJson = await tokenRes.json()
    if (!tokenRes.ok) {
      console.error('[exchange] token error from Google:', tokenJson)
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenJson)}`)
    }

    let email = ''
    try {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      })
      if (userRes.ok) {
        const u = await userRes.json()
        email = u.email ?? ''
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token,
      expires_in: tokenJson.expires_in,
      email,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('[exchange] error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
