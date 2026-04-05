import Link from 'next/link'

export const metadata = {
  title: 'ClientCase — Управление клиентскими делами',
  description: 'Платформа для управления клиентскими делами, проектами и документами.',
}

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b py-4 px-6">
        <h1 className="text-xl font-bold">ClientCase</h1>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-24 text-center">
        <h2 className="text-4xl font-bold mb-4">ClientCase</h2>
        <p className="text-lg text-muted-foreground max-w-xl mb-8">
          Платформа для управления клиентскими делами, проектами и документами.
          Для юридических фирм, консультантов и команд, работающих с клиентами.
        </p>
        <Link
          href="/login"
          className="bg-primary text-primary-foreground px-6 py-3 rounded-md font-medium hover:opacity-90 transition-opacity"
        >
          Войти в систему
        </Link>
      </main>
      <footer className="border-t py-4 px-6 text-sm text-muted-foreground flex gap-4 justify-center">
        <span>© 2026 ClientCase</span>
        <Link href="/privacy" className="hover:underline">Политика конфиденциальности</Link>
        <Link href="/terms" className="hover:underline">Условия использования</Link>
      </footer>
    </div>
  )
}
