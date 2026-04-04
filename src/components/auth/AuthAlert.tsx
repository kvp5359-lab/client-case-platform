/**
 * Алерт ошибки/успеха для форм авторизации
 */

interface AuthAlertProps {
  error: string | null
  success: string | null
}

export function AuthAlert({ error, success }: AuthAlertProps) {
  return (
    <>
      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">
          {success}
        </div>
      )}
    </>
  )
}
