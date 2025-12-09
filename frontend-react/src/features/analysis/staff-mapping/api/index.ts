/**
 * 员工映射 API (TanStack Query)
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/lib/api-client'
import type { ApiResponse } from '@/lib/types'
import type {
  ApplyToRecordsRequest,
  ApplyToRecordsResponse,
  CampusOption,
  MappingAtTime,
  Staff,
  StaffCreate,
  StaffMapping,
  StaffMappingCreate,
  StaffMappingUpdate,
  StaffUpdate,
  StaffWithMappings,
  SyncStaffResponse,
} from '../types'

// Query Keys
export const staffMappingKeys = {
  all: ['staff-mapping'] as const,
  staff: () => [...staffMappingKeys.all, 'staff'] as const,
  staffList: (includeInactive?: boolean) =>
    [...staffMappingKeys.staff(), { includeInactive }] as const,
  staffDetail: (id: number) => [...staffMappingKeys.staff(), id] as const,
  mappings: () => [...staffMappingKeys.all, 'mappings'] as const,
  mappingsList: (params?: { staffId?: number; includeExpired?: boolean }) =>
    [...staffMappingKeys.mappings(), params] as const,
  mappingsAtTime: (date: string) =>
    [...staffMappingKeys.mappings(), 'at-time', date] as const,
  campuses: () => [...staffMappingKeys.all, 'campuses'] as const,
}

// ============ 员工 API ============

// 获取员工列表
export function useStaffList(includeInactive = false) {
  return useQuery({
    queryKey: staffMappingKeys.staffList(includeInactive),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<Staff[]>>(
        '/staff-mapping/staff',
        { params: { include_inactive: includeInactive } }
      )
      return response.data.data
    },
  })
}

// 获取员工详情（含所有映射历史）
export function useStaffDetail(staffId: number) {
  return useQuery({
    queryKey: staffMappingKeys.staffDetail(staffId),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<StaffWithMappings>>(
        `/staff-mapping/staff/${staffId}`
      )
      return response.data.data
    },
    enabled: staffId > 0,
  })
}

// 创建员工
export function useCreateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: StaffCreate) => {
      const response = await apiClient.post<ApiResponse<Staff>>(
        '/staff-mapping/staff',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
    },
  })
}

// 更新员工
export function useUpdateStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: StaffUpdate }) => {
      const response = await apiClient.put<ApiResponse<Staff>>(
        `/staff-mapping/staff/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
    },
  })
}

// 删除员工
export function useDeleteStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/staff-mapping/staff/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.mappings() })
    },
  })
}

// 从通话记录同步员工
export function useSyncStaff() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const response = await apiClient.post<ApiResponse<SyncStaffResponse>>(
        '/staff-mapping/staff/sync'
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
    },
  })
}

// ============ 映射 API ============

// 获取映射列表
export function useMappingsList(params?: {
  staffId?: number
  includeExpired?: boolean
}) {
  return useQuery({
    queryKey: staffMappingKeys.mappingsList(params),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<StaffMapping[]>>(
        '/staff-mapping/mappings',
        {
          params: {
            staff_id: params?.staffId,
            include_expired: params?.includeExpired ?? true,
          },
        }
      )
      return response.data.data
    },
  })
}

// 获取指定日期的映射
export function useMappingsAtTime(date: string) {
  return useQuery({
    queryKey: staffMappingKeys.mappingsAtTime(date),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<MappingAtTime[]>>(
        '/staff-mapping/mappings/at-time',
        { params: { target_date: date } }
      )
      return response.data.data
    },
    enabled: !!date,
  })
}

// 创建映射
export function useCreateMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: StaffMappingCreate) => {
      const response = await apiClient.post<ApiResponse<StaffMapping>>(
        '/staff-mapping/mappings',
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.mappings() })
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
    },
  })
}

// 更新映射
export function useUpdateMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: StaffMappingUpdate }) => {
      const response = await apiClient.put<ApiResponse<StaffMapping>>(
        `/staff-mapping/mappings/${id}`,
        data
      )
      return response.data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.mappings() })
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
    },
  })
}

// 删除映射
export function useDeleteMapping() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      await apiClient.delete(`/staff-mapping/mappings/${id}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.mappings() })
      queryClient.invalidateQueries({ queryKey: staffMappingKeys.staff() })
    },
  })
}

// ============ 选项 API ============

// 获取校区选项
export function useCampusOptions() {
  return useQuery({
    queryKey: staffMappingKeys.campuses(),
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<CampusOption[]>>(
        '/staff-mapping/options/campuses'
      )
      return response.data.data
    },
    staleTime: 1000 * 60 * 60, // 1小时缓存
  })
}

// ============ 回写 API ============

// 回写到通话记录
export function useApplyToRecords() {
  return useMutation({
    mutationFn: async (data: ApplyToRecordsRequest) => {
      const response = await apiClient.post<ApiResponse<ApplyToRecordsResponse>>(
        '/staff-mapping/apply/to-records',
        data
      )
      return response.data.data
    },
  })
}
