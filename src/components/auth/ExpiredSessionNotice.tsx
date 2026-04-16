"use client"

/**
 * ExpiredSessionNotice — показывает toast при попадании на /login?expired=1.
 *
 * Так пользователь понимает, что его выкинуло не просто так, а из-за
 * протухшей сессии. После показа чистит query-параметр, чтобы при
 * перезагрузке toast не повторялся.
 */

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'

export function ExpiredSessionNotice() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('expired') !== '1') return

    toast.info('Сессия истекла. Пожалуйста, войдите снова.', {
      duration: 6000,
    })

    // Убираем ?expired=1 из URL, чтобы при рефреше toast не показывался повторно
    const params = new URLSearchParams(searchParams.toString())
    params.delete('expired')
    const query = params.toString()
    router.replace(query ? `/login?${query}` : '/login')
  }, [searchParams, router])

  return null
}
