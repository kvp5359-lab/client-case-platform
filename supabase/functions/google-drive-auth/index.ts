import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Verify user authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Verify user token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      );
    }

    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const redirectUri = `${supabaseUrl}/functions/v1/google-drive-callback`;

    if (!GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID is not configured');
    }

    // Parse request body to get origin and validate against whitelist
    const body = await req.json().catch(() => ({}));
    const rawOrigin = body.origin || '';

    // Z8-05: validate origin against ALLOWED_ORIGINS whitelist
    const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((o: string) => o.trim()).filter(Boolean);
    const origin = allowedOrigins.includes(rawOrigin) ? rawOrigin : '';

    // Generate a random state token and store it in DB with user binding
    const stateToken = crypto.randomUUID();
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { error: stateError } = await supabaseAdmin
      .from('oauth_states')
      .insert({
        state_token: stateToken,
        user_id: user.id,
        origin,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes TTL
      });

    if (stateError) {
      console.error('Failed to store OAuth state:', stateError);
      throw new Error('Failed to initiate OAuth flow');
    }

    // Google OAuth URL with required scopes for Google Drive and Google Sheets
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', stateToken);

    return new Response(
      JSON.stringify({ authUrl: authUrl.toString() }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error in google-drive-auth:', error);
    return new Response(
      JSON.stringify({ error: "Failed to initiate Google authorization" }),
      {
        headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});