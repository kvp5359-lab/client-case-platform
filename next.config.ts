import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // TODO: убрать после полного переноса всех файлов
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'zjatohckcpiqmxkmfxbs.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },
}

export default nextConfig
