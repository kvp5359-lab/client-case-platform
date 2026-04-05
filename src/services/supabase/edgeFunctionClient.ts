/**
 * callEdgeFunctionRaw — универсальный вызов Edge Function с авторизацией.
 * Возвращает сырой Response (для SSE/streaming) без автоматического парсинга.
 *
 * Используй для:
 * - SSE-стриминга (knowledge-search, chat-with-messages)
 * - Когда нужен прямой доступ к response.body
 *
 * Для обычных JSON-вызовов предпочитай supabase.functions.invoke() или callEdgeFunction из googleDriveService.
 */

import { supabase } from '@/lib/supabase'

interface CallEdgeFunctionRawParams {
  functionName: string
  body: Record<string, unknown>
  signal?: AbortSignal
}

export async function callEdgeFunctionRaw({
  functionName,
  body,
  signal,
}: CallEdgeFunctionRawParams): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session?.access_token) {
    throw new Error('Необходима авторизация')
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${functionName}`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
  }
  const apikey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (apikey) headers.apikey = apikey

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })
}
