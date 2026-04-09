import type { Payload } from 'payload'

import type {
  SummaryStats,
  ProjectProgress,
  ProjectExportRow,
  OverdueMilestone,
  StaffLoadItem,
  ExpiringDocument,
  MyProjectMilestone,
  PaginatedResult,
  MonthlyMilestoneCount,
  MonthlyCodData,
} from '@/lib/types'

export async function getSummaryStats(payload: Payload): Promise<SummaryStats> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'gen-permit') AS gen_permit_count,
      COUNT(*) FILTER (WHERE status = 'dev-permit') AS dev_permit_count,
      COUNT(*) FILTER (WHERE status = 'civil') AS civil_count,
      COUNT(*) FILTER (WHERE status = 'structural-elec') AS structural_elec_count,
      COUNT(*) FILTER (WHERE status = 'inspection') AS inspection_count,
      COUNT(*) FILTER (WHERE status = 'pre-cod') AS pre_cod_count,
      (SELECT COUNT(DISTINCT pm.project_id)
       FROM project_milestones pm
       WHERE pm.status IN ('pending', 'active')
         AND pm.due_date < CURRENT_DATE) AS delayed_projects
    FROM projects
  `)
  return result.rows[0] as unknown as SummaryStats
}

export async function getProjectProgress(payload: Payload): Promise<ProjectProgress[]> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT
      p.id, p.name, p.type, p.status, p.department, p.capacity_kw, p.cod_target,
      COUNT(pm.id) AS total_milestones,
      COUNT(pm.id) FILTER (WHERE pm.status = 'done') AS done_milestones,
      ROUND(
        100.0 * COUNT(pm.id) FILTER (WHERE pm.status = 'done')
        / NULLIF(COUNT(pm.id), 0), 1
      ) AS progress_pct,
      MIN(pm.due_date) FILTER (
        WHERE pm.status IN ('pending', 'active')
      ) AS next_due
    FROM projects p
    LEFT JOIN project_milestones pm ON pm.project_id = p.id
    GROUP BY p.id
    ORDER BY progress_pct DESC
  `)
  return result.rows as unknown as ProjectProgress[]
}

export async function getOverdueMilestones(
  payload: Payload,
  limit?: number,
): Promise<OverdueMilestone[]> {
  const db = payload.db.drizzle
  const limitClause = limit ? `LIMIT ${Number(limit)}` : ''
  const result = await db.execute(`
    SELECT pm.id, pm.name, pm.status, pm.due_date,
           pm.project_id, p.name AS project_name,
           p.code AS project_code,
           CURRENT_DATE - pm.due_date AS days_overdue
    FROM project_milestones pm
    JOIN projects p ON p.id = pm.project_id
    WHERE pm.status IN ('pending', 'active')
      AND pm.due_date < CURRENT_DATE
    ORDER BY days_overdue DESC
    ${limitClause}
  `)
  return result.rows as unknown as OverdueMilestone[]
}

export async function getStaffLoad(payload: Payload): Promise<StaffLoadItem[]> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT s.id, s.name, s.role,
           COALESCE(SUM(sa.allocation_pct), 0) AS total_allocation,
           COUNT(sa.id) AS active_projects
    FROM staff s
    LEFT JOIN staff_assignments sa ON sa.staff_id = s.id
      AND sa.start_date <= CURRENT_DATE
      AND (sa.end_date IS NULL OR sa.end_date >= CURRENT_DATE)
    GROUP BY s.id
    ORDER BY total_allocation DESC
  `)
  return result.rows as unknown as StaffLoadItem[]
}

export async function getExpiringDocuments(payload: Payload): Promise<ExpiringDocument[]> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT pd.id, pd.title, pd.doc_type, pd.expiry_date,
           pd.project_id, p.name AS project_name,
           pd.expiry_date - CURRENT_DATE AS days_until_expiry
    FROM project_documents pd
    JOIN projects p ON p.id = pd.project_id
    WHERE pd.expiry_date IS NOT NULL
      AND pd.expiry_date BETWEEN CURRENT_DATE
        AND CURRENT_DATE + INTERVAL '90 days'
    ORDER BY pd.expiry_date
  `)
  return result.rows as unknown as ExpiringDocument[]
}

export async function getMyMilestones(
  payload: Payload,
  userId: number,
): Promise<MyProjectMilestone[]> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT
      pm.id AS milestone_id,
      pm.name AS milestone_name,
      pm.status AS milestone_status,
      pm.seq_order,
      pm.due_date,
      pm.planned_date,
      pm.actual_date,
      CASE
        WHEN pm.status IN ('pending', 'active') AND pm.due_date < CURRENT_DATE
        THEN CURRENT_DATE - pm.due_date
        ELSE NULL
      END AS days_overdue,
      p.id AS project_id,
      p.name AS project_name,
      p.code AS project_code,
      p.type AS project_type,
      p.status AS project_status,
      mt.category
    FROM project_milestones pm
    JOIN projects p ON p.id = pm.project_id
    LEFT JOIN milestone_templates mt ON mt.id = pm.template_id
    WHERE pm.project_id IN (
      SELECT sa.project_id
      FROM staff_assignments sa
      JOIN staff s ON s.id = sa.staff_id
      WHERE s.user_id = ${Number(userId)}
        AND sa.start_date <= CURRENT_DATE
        AND (sa.end_date IS NULL OR sa.end_date >= CURRENT_DATE)
    )
    ORDER BY p.name, pm.seq_order
  `)
  return result.rows as unknown as MyProjectMilestone[]
}

export async function getProjectExportRows(
  payload: Payload,
  filters?: { type?: string; status?: string; q?: string },
): Promise<ProjectExportRow[]> {
  const db = payload.db.drizzle
  const conditions: string[] = []
  if (filters?.type) conditions.push(`p.type = '${filters.type.replace(/'/g, "''")}'`)
  if (filters?.status) conditions.push(`p.status = '${filters.status.replace(/'/g, "''")}'`)
  if (filters?.q) conditions.push(`p.name ILIKE '%${filters.q.replace(/'/g, "''")}%'`)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await db.execute(`
    SELECT
      p.code,
      p.name,
      p.type,
      p.status,
      p.department,
      p.capacity_kw,
      ROUND(
        100.0 * COUNT(pm.id) FILTER (WHERE pm.status = 'done')
        / NULLIF(COUNT(pm.id), 0), 1
      ) AS progress_pct,
      COUNT(pm.id) AS total_milestones,
      COUNT(pm.id) FILTER (WHERE pm.status = 'done') AS done_milestones,
      MIN(pm.due_date) FILTER (
        WHERE pm.status IN ('pending', 'active')
      ) AS next_due,
      p.created_at,
      p.cod_target,
      p.epc_value
    FROM projects p
    LEFT JOIN project_milestones pm ON pm.project_id = p.id
    ${where}
    GROUP BY p.id
    ORDER BY p.code
  `)
  return result.rows as unknown as ProjectExportRow[]
}

const SORT_COLUMNS: Record<string, string> = {
  name: 'p.name',
  capacity_kw: 'p.capacity_kw',
  progress_pct: 'progress_pct',
  cod_target: 'p.cod_target',
}

export async function getProjectProgressPaginated(
  payload: Payload,
  opts: {
    page?: number
    limit?: number
    sort?: string
    type?: string
    status?: string
    q?: string
  },
): Promise<PaginatedResult<ProjectProgress>> {
  const db = payload.db.drizzle
  const page = Math.max(1, opts.page || 1)
  const limit = Math.min(100, Math.max(1, opts.limit || 20))
  const offset = (page - 1) * limit

  const conditions: string[] = []
  if (opts.type) conditions.push(`p.type = '${opts.type.replace(/'/g, "''")}'`)
  if (opts.status) conditions.push(`p.status = '${opts.status.replace(/'/g, "''")}'`)
  if (opts.q) conditions.push(`p.name ILIKE '%${opts.q.replace(/'/g, "''")}%'`)
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  let orderBy = 'progress_pct DESC NULLS LAST'
  if (opts.sort) {
    const desc = opts.sort.startsWith('-')
    const key = desc ? opts.sort.slice(1) : opts.sort
    const col = SORT_COLUMNS[key]
    if (col) orderBy = `${col} ${desc ? 'DESC' : 'ASC'} NULLS LAST`
  }

  const [dataResult, countResult] = await Promise.all([
    db.execute(`
      SELECT
        p.id, p.name, p.type, p.status, p.department, p.capacity_kw, p.cod_target,
        COUNT(pm.id) AS total_milestones,
        COUNT(pm.id) FILTER (WHERE pm.status = 'done') AS done_milestones,
        ROUND(
          100.0 * COUNT(pm.id) FILTER (WHERE pm.status = 'done')
          / NULLIF(COUNT(pm.id), 0), 1
        ) AS progress_pct,
        MIN(pm.due_date) FILTER (
          WHERE pm.status IN ('pending', 'active')
        ) AS next_due
      FROM projects p
      LEFT JOIN project_milestones pm ON pm.project_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `),
    db.execute(`SELECT COUNT(*) AS cnt FROM projects p ${where}`),
  ])

  const totalDocs = Number((countResult.rows[0] as { cnt: string }).cnt)
  return {
    docs: dataResult.rows as unknown as ProjectProgress[],
    totalDocs,
    totalPages: Math.ceil(totalDocs / limit),
    page,
    limit,
  }
}

export async function getMonthlyMilestoneTrends(
  payload: Payload,
): Promise<MonthlyMilestoneCount[]> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT
      to_char(date_trunc('month', pm.actual_date), 'YYYY-MM') AS month,
      COUNT(*) AS completed
    FROM project_milestones pm
    WHERE pm.status = 'done'
      AND pm.actual_date >= CURRENT_DATE - INTERVAL '12 months'
    GROUP BY date_trunc('month', pm.actual_date)
    ORDER BY date_trunc('month', pm.actual_date)
  `)
  return result.rows as unknown as MonthlyMilestoneCount[]
}

export async function getMonthlyCodChart(payload: Payload): Promise<MonthlyCodData[]> {
  const db = payload.db.drizzle
  const result = await db.execute(`
    SELECT
      to_char(date_trunc('month', cod_target), 'YYYY-MM') AS month,
      COUNT(*) AS project_count,
      COALESCE(SUM(capacity_kw), 0) AS total_kw
    FROM projects
    WHERE cod_target IS NOT NULL
    GROUP BY date_trunc('month', cod_target)
    ORDER BY date_trunc('month', cod_target)
  `)
  return result.rows as unknown as MonthlyCodData[]
}
