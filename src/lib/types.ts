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
  active_projects: string
  delayed_projects: string
  due_this_week: string
  overloaded_staff: string
}
