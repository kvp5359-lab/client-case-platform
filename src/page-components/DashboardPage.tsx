/**
 * Dashboard Page — главная страница после входа
 * Перенаправляет в рабочие пространства
 */

import { useAuth } from '../contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/Header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowRight, FolderOpen } from 'lucide-react'
import { usePageTitle } from '@/hooks/usePageTitle'

export function DashboardPage() {
  usePageTitle('Дашборд')
  const { user } = useAuth()
  const router = useRouter()

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="p-6">
        <div className="max-w-2xl mx-auto mt-12">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Добро пожаловать, {user?.email}</CardTitle>
              <CardDescription>
                Перейдите в рабочее пространство, чтобы начать работу с проектами
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <Button size="lg" onClick={() => router.push('/workspaces')}>
                <FolderOpen className="w-5 h-5 mr-2" />
                Рабочие пространства
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
