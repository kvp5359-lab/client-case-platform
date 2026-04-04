"use client"

/**
 * ErrorBoundary — компонент для отлова ошибок при рендеринге
 *
 * Два уровня использования:
 * 1. Глобальный — оборачивает всё приложение (fallback с полной перезагрузкой)
 * 2. Секционный — оборачивает отдельные зоны (fallback с кнопкой "попробовать снова")
 */

import { Component, type ReactNode } from 'react'
import { logger } from '@/utils/logger'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Текст заголовка при ошибке */
  title?: string
  /** Показать кнопку перезагрузки страницы */
  fullPageReload?: boolean
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logger.error('[ErrorBoundary]', error)
    if (process.env.NODE_ENV === 'development' && info.componentStack) {
      console.error('[ErrorBoundary] Component stack:', info.componentStack)
    }

    // Автоперезагрузка при ошибке загрузки chunk'а после деплоя
    const msg = error.message || ''
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk') ||
      msg.includes('Unable to preload CSS') ||
      msg.includes('error loading dynamically imported module') ||
      (error.name === 'TypeError' && msg.includes('fetch'))
    if (isChunkError) {
      const key = 'chunk-reload'
      const now = Date.now()
      // Перезагружаем максимум раз за 10 сек, чтобы не зациклиться
      if (typeof window !== 'undefined') {
        const lastReload = sessionStorage.getItem(key)
        if (!lastReload || now - Number(lastReload) > 10_000) {
          sessionStorage.setItem(key, now.toString())
          window.location.reload()
          return
        }
      }
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    const { title = 'Что-то пошло не так', fullPageReload } = this.props

    return (
      <div role="alert" className="flex items-center justify-center min-h-[200px] p-8">
        <div className="text-center max-w-md space-y-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">
            Произошла непредвиденная ошибка. Попробуйте обновить страницу.
          </p>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <pre className="text-xs text-left bg-muted p-3 rounded-md overflow-auto max-h-[200px] whitespace-pre-wrap">
              {this.state.error.message}
              {this.state.error.stack && `\n\n${this.state.error.stack}`}
            </pre>
          )}
          <div className="flex gap-2 justify-center">
            {!fullPageReload && (
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                Попробовать снова
              </button>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="px-4 py-2 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      </div>
    )
  }
}
