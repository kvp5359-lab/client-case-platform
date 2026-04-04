/**
 * Стриминг AI-поиска по базе знаний (SSE)
 */

import { KnowledgeBaseError } from '../errors'
import { callEdgeFunctionRaw } from '../supabase/edgeFunctionClient'
import { parseSSEStream } from '@/utils/sseParser'
import type { SearchSource } from './knowledgeSearchService'

export interface StreamCallbacks {
  onSources: (sources: SearchSource[], chunksUsed: number) => void
  onText: (chunk: string) => void
  onDone: (fullAnswer: string) => void
  onError: (error: string) => void
}

export async function streamKnowledgeSearch(
  params: {
    question: string
    workspace_id: string
    project_id?: string
    template_id?: string
    conversation_history?: Array<{ role: string; content: string }>
    selected_article_ids?: string[]
    selected_qa_ids?: string[]
  },
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const response = await callEdgeFunctionRaw({
    functionName: 'knowledge-search',
    body: { ...params, stream: true },
    signal,
  }).catch((err) => {
    throw new KnowledgeBaseError(err instanceof Error ? err.message : 'Ошибка поиска')
  })

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new KnowledgeBaseError(errData.error || 'Ошибка поиска')
  }

  if (!response.body) {
    throw new KnowledgeBaseError('Response body is null')
  }

  await parseSSEStream(response.body, (event) => {
    switch (event.type) {
      case 'sources': {
        const d = event.data as { sources: SearchSource[]; chunks_used: number }
        callbacks.onSources(d.sources, d.chunks_used)
        break
      }
      case 'text':
        callbacks.onText(event.data as string)
        break
      case 'done':
        callbacks.onDone((event.data as { answer: string }).answer)
        break
      case 'error':
        callbacks.onError((event.data as { error: string }).error)
        break
    }
  })
}
