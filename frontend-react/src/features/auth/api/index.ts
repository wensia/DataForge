/**
 * 认证相关 API
 */
import { useMutation, useQuery } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type {
  ApiResponse,
  LoginRequest,
  LoginResponse,
  User,
} from '@/lib/types'

// Query Keys
export const authKeys = {
  all: ['auth'] as const,
  me: () => [...authKeys.all, 'me'] as const,
}

// 登录
export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest) => {
      const response = await apiClient.post<ApiResponse<LoginResponse>>(
        '/auth/login',
        data
      )
      return response.data.data
    },
  })
}

// 获取当前用户信息
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<User>>('/auth/me')
      return response.data.data
    },
    retry: false,
  })
}
