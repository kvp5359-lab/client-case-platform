/**
 * Register Page — страница регистрации
 */

import { RegisterForm } from '../components/auth/RegisterForm'

export function RegisterPage() {
  return (
    <div className="max-w-[400px] mx-auto mt-16 p-8 border border-gray-200 rounded-lg">
      <RegisterForm />
    </div>
  )
}
