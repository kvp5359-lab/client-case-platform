/**
 * Layout для /login — добавляет ExpiredSessionNotice поверх страницы.
 * Notice показывает toast при `?expired=1` (когда пользователя выкинуло
 * из-за невалидной сессии — см. useSidebarData.ts).
 */

import { Suspense } from 'react'
import { ExpiredSessionNotice } from '@/components/auth/ExpiredSessionNotice'

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ExpiredSessionNotice />
      </Suspense>
      {children}
    </>
  )
}
