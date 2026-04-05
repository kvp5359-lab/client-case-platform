import Link from 'next/link'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b py-4 px-6">
        <h1 className="text-xl font-bold">ClientCase</h1>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t py-4 px-6 text-sm text-muted-foreground flex gap-4">
        <span>© 2026 ClientCase</span>
        <Link href="/privacy" className="hover:underline">Политика конфиденциальности</Link>
        <Link href="/terms" className="hover:underline">Условия использования</Link>
      </footer>
    </div>
  )
}
