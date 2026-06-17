"use client"

/**
 * PerfSinkRegistrar — подключает отправку сводок perfTrace на сервер.
 *
 * Когда тумблер «Диагностика производительности» включён, perfTrace по
 * завершении каждой сессии открытия треда зовёт зарегистрированный sink.
 * Здесь sink пишет сводку в таблицу public.perf_traces (user_id проставляет
 * БД через DEFAULT auth.uid()). Это даёт серверный лог, который можно
 * анализировать постфактум, не полагаясь на консоль браузера.
 *
 * Ничего не рендерит. Вставка fire-and-forget, ошибки проглатываются —
 * диагностика не должна влиять на работу приложения.
 */

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Json } from '@/types/database'
import { setPerfSink } from '@/utils/perfTrace'

export function PerfSinkRegistrar() {
  useEffect(() => {
    setPerfSink((payload) => {
      void supabase
        .from('perf_traces')
        .insert({
          thread_id: payload.threadId,
          total_ms: payload.totalMs,
          channel: payload.channel ?? null,
          thread_type: payload.threadType ?? null,
          // marks по построению JSON-сериализуемы (label/t/meta из примитивов).
          marks: payload.marks as unknown as Json,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        })
        .then(({ error }) => {
          if (error) {
            console.debug('perfTrace: не удалось записать на сервер', error.message)
          }
        })
    })
    return () => setPerfSink(null)
  }, [])

  return null
}
