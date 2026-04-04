/**
 * Supabase Client — подключение к Backend
 *
 * Этот файл создаёт единственный экземпляр Supabase клиента
 * для всего приложения.
 */

import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Получаем переменные окружения (Vite)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Проверяем что переменные заданы
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase переменные не найдены!\n\n' +
      'Создайте .env файл в корне проекта и добавьте:\n' +
      'VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
      'VITE_SUPABASE_ANON_KEY=your_anon_key_here\n\n' +
      'Получить значения: https://app.supabase.com/project/_/settings/api',
  )
}

// Создаём типизированный клиент
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Настройки авторизации
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
