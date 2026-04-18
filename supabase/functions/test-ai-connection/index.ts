// Edge Function для тестирования подключения к AI (Claude или Gemini)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { isValidUUID } from "../_shared/validation.ts";
import { isGeminiModel, callGeminiApi } from "../_shared/gemini-client.ts";

Deno.serve(async (req) => {
  // Обработка CORS preflight запроса
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  try {
    // Verify user authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify user token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    let body: { workspace_id?: string; model?: string };
    try {
      body = await req.json()
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const { workspace_id, model } = body

    if (!workspace_id || !model) {
      return new Response(
        JSON.stringify({ success: false, error: 'Не указан workspace_id или модель' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    if (!isValidUUID(workspace_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid workspace_id format' }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Verify user has access to this workspace (via RLS)
    const { data: membership, error: memberError } = await supabaseUser
      .from('participants')
      .select('id')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .eq('is_deleted', false)
      .maybeSingle()

    if (memberError || !membership) {
      return new Response(
        JSON.stringify({ success: false, error: 'Нет доступа к этому workspace' }),
        { status: 403, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Use service role only for vault access (API key)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Determine provider and get the correct API key
    const isGemini = isGeminiModel(model)
    const rpcName = isGemini ? 'get_workspace_google_api_key' : 'get_workspace_api_key'

    const { data: keyData, error: keyError } = await supabaseAdmin
      .rpc(rpcName, { workspace_uuid: workspace_id })

    if (keyError || !keyData) {
      const providerName = isGemini ? 'Google' : 'Anthropic'
      return new Response(
        JSON.stringify({
          success: false,
          error: `${providerName} API ключ не найден. Сначала сохраните ключ в настройках.`
        }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = keyData as string

    if (isGemini) {
      // Test Gemini connection
      try {
        const answer = await callGeminiApi({
          apiKey,
          model,
          contents: [{ role: 'user', parts: [{ text: 'Ответь одним словом: работает?' }] }],
          thinkingBudget: 0,
        })

        return new Response(
          JSON.stringify({
            success: true,
            model,
            response: answer || 'OK',
          }),
          { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      } catch (err) {
        const errorMessage = err instanceof Error && err.message.includes('401')
          ? 'Неверный API ключ. Проверьте ключ в настройках.'
          : err instanceof Error && err.message.includes('400')
            ? 'Некорректный запрос. Проверьте настройки модели.'
            : 'Ошибка API. Попробуйте позже.'

        return new Response(
          JSON.stringify({ success: false, error: errorMessage }),
          { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
        )
      }
    }

    // Test Claude connection (original logic)
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 50,
        messages: [
          {
            role: 'user',
            content: 'Ответь одним словом: работает?'
          }
        ]
      })
    })

    const responseData = await response.json()

    if (!response.ok) {
      let errorMessage = 'Неизвестная ошибка'

      if (responseData.error?.type === 'authentication_error') {
        errorMessage = 'Неверный API ключ. Проверьте ключ в настройках.'
      } else if (responseData.error?.type === 'invalid_request_error') {
        errorMessage = 'Некорректный запрос. Проверьте настройки модели.'
      } else {
        errorMessage = 'Ошибка API. Попробуйте позже.'
      }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage
        }),
        { status: 400, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
      )
    }

    // Успешный ответ
    return new Response(
      JSON.stringify({
        success: true,
        model: model,
        response: responseData.content?.[0]?.text || 'OK'
      }),
      { status: 200, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error testing AI connection:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Внутренняя ошибка сервера'
      }),
      { status: 500, headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' } }
    )
  }
})
