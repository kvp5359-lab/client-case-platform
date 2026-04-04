import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const inter = localFont({
  src: [
    {
      path: '../fonts/Inter-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../fonts/Inter-Medium.woff2',
      weight: '500',
      style: 'normal',
    },
    {
      path: '../fonts/Inter-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
    {
      path: '../fonts/Inter-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ClientCase',
  description: 'Платформа управления клиентскими делами',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ru" className={`${inter.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  )
}
