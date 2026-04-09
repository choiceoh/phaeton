export interface ProjectProgress {
  id: number
  name: string
  type: string
  status: string
  department: string | null
  capacity_kw: number | null
  cod_target: string | null
  total_milestones: string
  done_milestones: string
  progress_pct: string | null
  next_due: string | null
}

export interface ProjectExportRow {
  code: string
  name: string
  type: string
  status: string
  department: string | null
  capacity_kw: number | null
  progress_pct: string | null
  total_milestones: string
  done_milestones: string
  next_due: string | null
  created_at: string
  cod_target: string | null
  epc_value: number | null
}

export interface OverdueMilestone {
  id: number
  name: string
  project_name: string
  project_code: string
  due_date: string
  days_overdue: string
  status: string
  project_id: number
}

export interface StaffLoadItem {
  id: number
  name: string
  role: string | null
  total_allocation: string
  active_projects: string
}

export interface ExpiringDocument {
  id: number
  title: string
  project_name: string
  doc_type: string
  expiry_date: string
  days_until_expiry: string
  project_id: number
}

export interface SummaryStats {
  gen_permit_count: string
  dev_permit_count: string
  civil_count: string
  structural_elec_count: string
  inspection_count: string
  pre_cod_count: string
  delayed_projects: string
}

export interface MyProjectMilestone {
  milestone_id: number
  milestone_name: string
  milestone_status: string
  seq_order: number
  due_date: string | null
  planned_date: string | null
  actual_date: string | null
  days_overdue: number | null
  project_id: number
  project_name: string
  project_code: string
  project_type: string
  project_status: string
  category: string | null
}

export interface PaginatedResult<T> {
  docs: T[]
  totalDocs: number
  totalPages: number
  page: number
  limit: number
}

export interface MonthlyMilestoneCount {
  month: string
  completed: string
}

export interface MonthlyCodData {
  month: string
  project_count: string
  total_kw: string
}
