import {
  getCachedSummaryStats,
  getCachedProjectProgress,
  getCachedOverdueMilestones,
  getCachedExpiringDocuments,
  getCachedStaffLoad,
} from '@/lib/cachedQueries'
import type {
  ExpiringDocument,
  OverdueMilestone,
  ProjectProgress,
  StaffLoadItem,
  SummaryStats,
} from '@/lib/types'

import { AlertListBlock } from './AlertListBlock'
import { ChartBlock } from './ChartBlock'
import { HeadingBlock } from './HeadingBlock'
import { ProjectListBlock } from './ProjectListBlock'
import { RichTextBlock } from './RichTextBlock'
import { StaffOverviewBlock } from './StaffOverviewBlock'
import { StatsRowBlock } from './StatsRowBlock'

interface BlockData {
  blockType: string
  [key: string]: any
}

interface FetchedData {
  summary?: SummaryStats
  projects?: ProjectProgress[]
  overdue?: OverdueMilestone[]
  expiring?: ExpiringDocument[]
  staffLoad?: StaffLoadItem[]
}

function needsData(blocks: BlockData[]) {
  const types = new Set(blocks.map((b) => b.blockType))
  return {
    summary: types.has('stats-row'),
    projects: types.has('project-list') || types.has('chart'),
    alerts: types.has('alert-list'),
    staff: types.has('staff-overview') || types.has('alert-list') || types.has('chart'),
  }
}

function filterProjects(
  projects: ProjectProgress[],
  block: BlockData,
): ProjectProgress[] {
  let filtered = projects
  if (block.statusFilter?.length) {
    filtered = filtered.filter((p) => block.statusFilter.includes(p.status))
  }
  if (block.typeFilter?.length) {
    filtered = filtered.filter((p) => block.typeFilter.includes(p.type))
  }
  if (block.limit) {
    filtered = filtered.slice(0, block.limit)
  }
  return filtered
}

export async function RenderBlocks({ blocks }: { blocks: BlockData[] }) {
  if (!blocks?.length) return null

  const needs = needsData(blocks)
  const data: FetchedData = {}

  const fetches: Promise<void>[] = []
  if (needs.summary) {
    fetches.push(getCachedSummaryStats().then((d) => { data.summary = d }))
  }
  if (needs.projects) {
    fetches.push(getCachedProjectProgress().then((d) => { data.projects = d }))
  }
  if (needs.alerts) {
    fetches.push(getCachedOverdueMilestones().then((d) => { data.overdue = d }))
    fetches.push(getCachedExpiringDocuments().then((d) => { data.expiring = d }))
  }
  if (needs.staff) {
    fetches.push(getCachedStaffLoad().then((d) => { data.staffLoad = d }))
  }

  await Promise.all(fetches)

  return (
    <div className="space-y-6">
      {blocks.map((block, i) => {
        const key = `${block.blockType}-${i}`
        switch (block.blockType) {
          case 'heading':
            return (
              <HeadingBlock
                key={key}
                text={block.text}
                level={block.level}
                description={block.description}
              />
            )

          case 'rich-text':
            return <RichTextBlock key={key} content={block.content} />

          case 'stats-row':
            return data.summary ? (
              <StatsRowBlock key={key} title={block.title} summary={data.summary} />
            ) : null

          case 'project-list':
            return data.projects ? (
              <ProjectListBlock
                key={key}
                title={block.title}
                viewType={block.viewType}
                projects={filterProjects(data.projects, block)}
              />
            ) : null

          case 'alert-list': {
            const limit = block.limit || 5
            return (
              <AlertListBlock
                key={key}
                title={block.title}
                alertTypes={block.alertTypes}
                overdue={(data.overdue || []).slice(0, limit)}
                expiring={(data.expiring || []).slice(0, limit)}
                overloaded={(data.staffLoad || [])
                  .filter((s) => Number(s.total_allocation) > 100)
                  .slice(0, limit)}
              />
            )
          }

          case 'staff-overview':
            return data.staffLoad ? (
              <StaffOverviewBlock
                key={key}
                title={block.title}
                showOnlyOverloaded={block.showOnlyOverloaded}
                staff={data.staffLoad}
              />
            ) : null

          case 'chart':
            return (
              <ChartBlock
                key={key}
                title={block.title}
                chartType={block.chartType}
                dataSource={block.dataSource}
                projects={data.projects || []}
                staffLoad={data.staffLoad || []}
              />
            )

          default:
            return null
        }
      })}
    </div>
  )
}
