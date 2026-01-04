'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function EmailSignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {}
    
    if (!email) {
      newErrors.email = 'Email is required'
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid'
    }
    
    if (!password) {
      newErrors.password = 'Password is required'
    } else if (password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validate()) return
    
    setIsLoading(true)
    
    // TODO: Implement actual email signup
    // For now, just route to profile
    setTimeout(() => {
      setIsLoading(false)
      router.push('/auth/profile')
    }, 500)
  }

  return (
    <main className="flex min-h-screen flex-col px-6 py-12">
      <div className="mb-8">
        <Link
          href="/auth"
          className="text-blue-600 font-medium text-lg py-2 px-1 -ml-1 inline-block"
        >
          Back
        </Link>
      </div>

      <div className="flex flex-col justify-center flex-1 space-y-8">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold text-gray-900 leading-tight">
            Create your account
          </h1>
          <p className="text-lg text-gray-600">
            Sign up with your email address
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full p-4 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-lg ${
                errors.email ? 'border-red-300' : 'border-gray-200'
              }`}
              placeholder="you@example.com"
              disabled={isLoading}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full p-4 border-2 rounded-xl focus:outline-none focus:border-blue-600 text-lg ${
                errors.password ? 'border-red-300' : 'border-gray-200'
              }`}
              placeholder="At least 8 characters"
              disabled={isLoading}
            />
            {errors.password && (
              <p className="mt-1 text-sm text-red-600">{errors.password}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-4 px-6 rounded-xl font-semibold text-lg text-white shadow-lg transition-colors ${
              isLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
      </div>
    </main>
  )
}

