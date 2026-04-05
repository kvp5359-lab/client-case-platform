import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'О платформе — ClientCase',
  description: 'ClientCase — платформа управления клиентскими делами для юристов',
}

export default function AboutPage() {
  return (
    <div className="container mx-auto py-16 text-center">
      <h2 className="text-3xl font-bold mb-4">О платформе</h2>
      <p className="text-muted-foreground text-lg">ClientCase — платформа управления клиентскими делами для юристов</p>
    </div>
  )
}
