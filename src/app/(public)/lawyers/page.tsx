import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Каталог юристов — ClientCase',
  description: 'Каталог проверенных юристов и правовых специалистов',
}

export default function LawyersPage() {
  return (
    <div className="container mx-auto py-16 text-center">
      <h2 className="text-3xl font-bold mb-4">Каталог юристов</h2>
      <p className="text-muted-foreground text-lg">Скоро здесь появится каталог юристов и специалистов</p>
    </div>
  )
}
