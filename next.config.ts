import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zjatohckcpiqmxkmfxbs.supabase.co',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'ssl.gstatic.com',
      },
      {
        protocol: 'https',
        hostname: 'drive-thirdparty.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: '*.wazzup24.com',
      },
      {
        protocol: 'https',
        hostname: 'pps.whatsapp.net',
      },
    ],
  },
}

// Sentry: оборачивает конфиг для перехвата ошибок. Загрузку source-map НЕ
// включаем (нужен SENTRY_AUTH_TOKEN в CI) — ошибки ловятся и без неё, стеки
// минифицированы. Включить позже: добавить authToken + sourcemaps.
export default withSentryConfig(nextConfig, {
  org: 'kirill-prudnikov',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  sourcemaps: { disable: true },
  // tunnelRoute НЕ включаем: auth-middleware (proxy.ts) редиректит любой путь
  // → /login, включая туннель, и события Sentry не доходили. Без туннеля SDK
  // шлёт напрямую в ingest.de.sentry.io.
})
