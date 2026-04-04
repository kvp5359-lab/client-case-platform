/**
 * Supabase Client — подключение к Backend
 *
 * Использует @supabase/ssr для корректной работы с cookies
 * (синхронизация сессии между клиентом и middleware).
 */

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase переменные не найдены!\n\n' +
      'Создайте .env файл в корне проекта и добавьте:\n' +
      'NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co\n' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here\n\n' +
      'Получить значения: https://app.supabase.com/project/_/settings/api',
  )
}

export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)
