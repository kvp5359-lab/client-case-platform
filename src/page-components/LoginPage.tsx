/**
 * Login Page — страница входа
 */

import { LoginForm } from '../components/auth/LoginForm'

export function LoginPage() {
  return (
    <div className="max-w-[400px] mx-auto mt-16 p-8 border border-gray-200 rounded-lg">
      <LoginForm />
    </div>
  )
}
