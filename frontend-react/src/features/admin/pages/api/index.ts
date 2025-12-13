import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type { NavPageConfig, UserPreferenceResponse } from '../types'
import { getDefaultNavConfig } from '../utils/default-config'

const NAV_CONFIG_KEY = 'sidebar_nav_config'

export const navConfigKeys = {
  all: ['nav-config'] as const,
  config: () => [...navConfigKeys.all, 'config'] as const,
}

export function useNavConfig() {
  return useQuery({
    queryKey: navConfigKeys.config(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<UserPreferenceResponse | null>>(
        `/user-preferences/${NAV_CONFIG_KEY}`
      )
      const data = response.data.data
      if (!data) {
        return getDefaultNavConfig()
      }
      try {
        return JSON.parse(data.preference_value) as NavPageConfig
      } catch {
        return getDefaultNavConfig()
      }
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useSaveNavConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (config: NavPageConfig) => {
      const response = await apiClient.put<ApiResponse<UserPreferenceResponse>>(
        `/user-preferences/${NAV_CONFIG_KEY}`,
        { preference_value: JSON.stringify(config) }
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: navConfigKeys.all })
    },
  })
}

export function useResetNavConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete(`/user-preferences/${NAV_CONFIG_KEY}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: navConfigKeys.all })
    },
  })
}
