export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b py-4 px-6">
        <h1 className="text-xl font-bold">ClientCase</h1>
      </header>
      <main>{children}</main>
    </div>
  )
}
