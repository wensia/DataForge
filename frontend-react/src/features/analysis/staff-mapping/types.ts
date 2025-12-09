/**
 * 员工映射类型定义
 */

export interface Staff {
  id: number
  name: string
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  current_mapping: StaffMapping | null
}

export interface StaffMapping {
  id: number
  staff_id: number
  position: string | null
  department: string | null
  campus: string | null
  effective_from: string
  effective_to: string | null
  created_at: string
  updated_at: string
}

export interface StaffWithMappings extends Omit<Staff, 'current_mapping'> {
  mappings: StaffMapping[]
}

export interface StaffCreate {
  name: string
  phone?: string | null
  is_active?: boolean
}

export interface StaffUpdate {
  name?: string
  phone?: string | null
  is_active?: boolean
}

export interface StaffMappingCreate {
  staff_id: number
  position?: string | null
  department?: string | null
  campus?: string | null
  effective_from: string
  effective_to?: string | null
}

export interface StaffMappingUpdate {
  position?: string | null
  department?: string | null
  campus?: string | null
  effective_from?: string
  effective_to?: string | null
}

export interface CampusOption {
  value: string
  label: string
}

export interface ApplyToRecordsRequest {
  start_date?: string | null
  end_date?: string | null
  dry_run?: boolean
}

export interface ApplyToRecordsResponse {
  updated_count: number
  skipped_count: number
  details: Array<{
    record_id: number
    staff_name: string
    call_date?: string
    status: string
    reason?: string
    mapping?: {
      position: string | null
      department: string | null
      campus: string | null
    }
  }>
}

export interface SyncStaffResponse {
  total_names: number
  added: number
  existing: number
}

export interface MappingAtTime {
  staff_id: number
  staff_name: string
  mapping: StaffMapping
}
