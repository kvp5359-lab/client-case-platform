/**
 * Переключатель бэкенда хранилища: Supabase Storage ⇄ Cloudflare R2, ПО БАКЕТАМ.
 *
 * `NEXT_PUBLIC_STORAGE_R2_BUCKETS` — список бакетов (через запятую), которые уже
 * читаются/пишутся из R2. Пусто/не задано → всё на Supabase (текущее поведение).
 * Спец-значение `*` → все бакеты на R2.
 *
 * Пер-бакетный флаг даёт поэтапный, обратимый переезд: включаем по одному,
 * откат — убрать бакет из списка (без деплоя кода, только env).
 */

const raw = (process.env.NEXT_PUBLIC_STORAGE_R2_BUCKETS ?? '').trim()

const r2Buckets: Set<string> = new Set(
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

const allOnR2 = r2Buckets.has('*')

/** true → этот бакет обслуживается R2; false → Supabase Storage. */
export function isBucketOnR2(bucket: string): boolean {
  return allOnR2 || r2Buckets.has(bucket)
}
