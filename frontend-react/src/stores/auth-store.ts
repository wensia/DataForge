/**
 * 认证状态管理
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, UserRole } from '@/lib/types'

interface AuthState {
  auth: {
    // 用户信息
    user: User | null
    setUser: (user: User | null) => void

    // 访问令牌
    accessToken: string
    setAccessToken: (token: string) => void
    resetAccessToken: () => void

    // 重置所有状态
    reset: () => void

    // 辅助方法
    isAuthenticated: () => boolean
    isAdmin: () => boolean
    hasRole: (role: UserRole) => boolean
  }
}

const AUTH_TOKEN_KEY = 'auth_token'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      auth: {
        user: null,
        accessToken: '',

        setUser: (user) =>
          set((state) => ({
            ...state,
            auth: { ...state.auth, user },
          })),

        setAccessToken: (accessToken) =>
          set((state) => {
            // 同步到 localStorage (用于 API 客户端拦截器)
            localStorage.setItem(AUTH_TOKEN_KEY, accessToken)
            return {
              ...state,
              auth: { ...state.auth, accessToken },
            }
          }),

        resetAccessToken: () =>
          set((state) => {
            localStorage.removeItem(AUTH_TOKEN_KEY)
            return {
              ...state,
              auth: { ...state.auth, accessToken: '' },
            }
          }),

        reset: () =>
          set((state) => {
            localStorage.removeItem(AUTH_TOKEN_KEY)
            return {
              ...state,
              auth: { ...state.auth, user: null, accessToken: '' },
            }
          }),

        isAuthenticated: () => {
          const { accessToken, user } = get().auth
          return !!accessToken && !!user
        },

        isAdmin: () => {
          const { user } = get().auth
          return user?.role === 'admin'
        },

        hasRole: (role: UserRole) => {
          const { user } = get().auth
          return user?.role === role
        },
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        auth: {
          user: state.auth.user,
          accessToken: state.auth.accessToken,
        },
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AuthState>
        return {
          ...currentState,
          auth: {
            ...currentState.auth,
            user: persisted?.auth?.user ?? null,
            accessToken: persisted?.auth?.accessToken ?? '',
          },
        }
      },
    }
  )
)
