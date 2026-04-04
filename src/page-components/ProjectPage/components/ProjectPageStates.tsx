"use client"

/**
 * Состояния загрузки, отказа в доступе и «не найден» для ProjectPage.
 */

import { WorkspaceLayout } from '@/components/WorkspaceLayout'
import { Button } from '@/components/ui/button'

interface LoadingStateProps {
  type: 'loading'
}

interface AccessDeniedStateProps {
  type: 'access-denied'
  onBack: () => void
}

interface NotFoundStateProps {
  type: 'not-found'
  onBack: () => void
}

type ProjectPageStateProps = LoadingStateProps | AccessDeniedStateProps | NotFoundStateProps

export function ProjectPageState(props: ProjectPageStateProps) {
  return (
    <WorkspaceLayout>
      <div className="flex-1 flex items-center justify-center">
        {props.type === 'loading' && <p className="text-muted-foreground">Загрузка...</p>}
        {props.type === 'access-denied' && (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">🔒 Нет доступа</h2>
            <p className="text-muted-foreground mb-4">У вас нет прав для просмотра этого проекта</p>
            <Button onClick={props.onBack}>Вернуться на главную</Button>
          </div>
        )}
        {props.type === 'not-found' && (
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">Проект не найден</h2>
            <p className="text-muted-foreground mb-4">Проект с таким ID не существует</p>
            <Button onClick={props.onBack}>Вернуться к списку проектов</Button>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  )
}
