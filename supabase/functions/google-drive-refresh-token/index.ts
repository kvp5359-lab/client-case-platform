import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getValidAccessTokenForUser } from "../_shared/googleDriveToken.ts";

/**
 * Edge Function: google-drive-refresh-token
 *
 * Обновляет access_token Google Drive на сервере, чтобы client_secret
 * не утекал в клиентский код (VITE_* переменные видны в браузере).
 *
 * Возвращает актуальный access_token.
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    const userToken = authHeader.slice(7);
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(userToken);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // Получаем валидный access token (автоматически обновляется при необходимости)
    const accessToken = await getValidAccessTokenForUser(supabaseAdmin, user.id);

    return new Response(
      JSON.stringify({ access_token: accessToken }),
      { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Refresh token error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to refresh token" }),
      {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      }
    );
  }
});