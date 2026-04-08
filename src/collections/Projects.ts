import type { CollectionConfig } from 'payload'

import { copyMilestones } from '../hooks/copyMilestones.ts'
import { calculateProgress } from '../hooks/calculateProgress.ts'
import { autoGenerateCode } from '../hooks/autoGenerateCode.ts'

const CODE_PATTERN = /^(SL|WD|ES|HB)-\d{4}-\d{3}$/

export const Projects: CollectionConfig = {
  slug: 'projects',
  admin: { useAsTitle: 'name' },
  labels: { singular: '프로젝트', plural: '프로젝트 목록' },
  versions: { drafts: false, maxPerDoc: 20 },
  hooks: {
    beforeValidate: [autoGenerateCode],
    afterChange: [copyMilestones],
    afterRead: [calculateProgress],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: '기본정보',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'name',
                  type: 'text',
                  required: true,
                  label: '프로젝트명',
                },
                {
                  name: 'code',
                  type: 'text',
                  required: true,
                  unique: true,
                  label: '프로젝트 코드',
                  admin: { description: 'SL-2025-001, WD-2025-001, ES-2025-001, HB-2025-001' },
                  validate: (value: unknown) => {
                    if (!value) return true
                    if (typeof value !== 'string') return '문자열이어야 합니다'
                    return CODE_PATTERN.test(value)
                      || '형식 오류: SL-2025-001 (유형-연도-번호)'
                  },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'type',
                  type: 'select',
                  required: true,
                  label: '사업 유형',
                  options: [
                    { label: '태양광', value: 'solar' },
                    { label: '풍력', value: 'wind' },
                    { label: 'ESS', value: 'ess' },
                    { label: '하이브리드', value: 'hybrid' },
                  ],
                },
                {
                  name: 'department',
                  type: 'select',
                  label: '담당부서',
                  options: [
                    { label: '신재생사업본부', value: 'renewable' },
                    { label: '전략사업본부', value: 'strategy' },
                    { label: 'O&M사업본부', value: 'onm' },
                    { label: '미래사업실', value: 'future' },
                    { label: '기획조정실', value: 'planning' },
                    { label: '솔라사업실', value: 'solar' },
                    { label: '개발사업본부', value: 'development' },
                  ],
                },
                {
                  name: 'status',
                  type: 'select',
                  required: true,
                  defaultValue: 'gen-permit',
                  label: '상태',
                  options: [
                    { label: '발전허가', value: 'gen-permit' },
                    { label: '개발허가', value: 'dev-permit' },
                    { label: '토목', value: 'civil' },
                    { label: '구조물 및 전기공사', value: 'structural-elec' },
                    { label: '사용전 검사', value: 'inspection' },
                    { label: '준공대기', value: 'pre-cod' },
                  ],
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'assignedPM',
                  type: 'relationship',
                  relationTo: 'users',
                  label: '담당 PM',
                },
                {
                  name: 'client',
                  type: 'text',
                  label: '발주처 / 사업주',
                },
              ],
            },
            {
              name: 'progressPct',
              type: 'number',
              label: '진행률 (%)',
              virtual: true,
              admin: {
                readOnly: true,
                description: '마일스톤 완료율 기반 자동 계산',
              },
            },
          ],
        },

        {
          label: '현장·설비',
          fields: [
            {
              name: 'capacityKw',
              type: 'number',
              label: '설비용량 (kW)',
            },
            {
              name: 'site',
              type: 'group',
              label: '현장 정보',
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'address', type: 'text', label: '주소' },
                    { name: 'region', type: 'text', label: '지역 (시도)' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'landAreaM2', type: 'number', label: '부지면적 (m²)' },
                    { name: 'landType', type: 'text', label: '지목 (임야, 답, 전 등)' },
                  ],
                },
                {
                  name: 'coordinates',
                  type: 'group',
                  label: '좌표',
                  fields: [
                    {
                      type: 'row',
                      fields: [
                        { name: 'lat', type: 'number', label: '위도' },
                        { name: 'lng', type: 'number', label: '경도' },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: '태양광 설비',
              admin: {
                condition: (data: Record<string, any>) =>
                  data.type === 'solar' || data.type === 'hybrid',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'moduleCount', type: 'number', label: '모듈 수량' },
                    { name: 'moduleType', type: 'text', label: '모듈 종류' },
                    { name: 'inverterCapacityKw', type: 'number', label: '인버터 용량 (kW)' },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: '풍력 설비',
              admin: {
                condition: (data: Record<string, any>) =>
                  data.type === 'wind' || data.type === 'hybrid',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'turbineCount', type: 'number', label: '터빈 수량' },
                    { name: 'turbineModel', type: 'text', label: '터빈 모델' },
                    { name: 'hubHeightM', type: 'number', label: '허브 높이 (m)' },
                  ],
                },
              ],
            },
            {
              type: 'collapsible',
              label: 'ESS 설비',
              admin: {
                condition: (data: Record<string, any>) =>
                  data.type === 'ess' || data.type === 'hybrid',
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'batteryCapacityKwh', type: 'number', label: '배터리 용량 (kWh)' },
                    { name: 'pcsCapacityKw', type: 'number', label: 'PCS 용량 (kW)' },
                  ],
                },
              ],
            },
            {
              name: 'metadata',
              type: 'json',
              label: '추가 정보',
              admin: { description: '위 항목 외 추가 스펙 입력' },
            },
          ],
        },

        {
          label: '일정',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'codTarget', type: 'date', label: 'COD 목표일' },
                {
                  name: 'codActual',
                  type: 'date',
                  label: 'COD 실제일',
                  validate: (value: unknown, { siblingData }: any) => {
                    if (!value || !siblingData?.codTarget) return true
                    return new Date(value as string) >= new Date(siblingData.codTarget)
                      || 'COD 실제일이 목표일보다 이전일 수 없습니다'
                  },
                },
              ],
            },
          ],
        },

        {
          label: '재무',
          fields: [
            {
              name: 'epcValue',
              type: 'number',
              label: '도급금액 (원)',
              access: {
                read: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
                update: ({ req }) => req.user?.role === 'director',
              },
            },
          ],
        },

        {
          label: '마일스톤',
          fields: [
            {
              name: 'milestones',
              type: 'join',
              collection: 'project-milestones',
              on: 'project',
              label: '마일스톤 목록',
              defaultSort: 'seqOrder',
              admin: {
                defaultColumns: ['name', 'status', 'dueDate', 'assignee'],
                allowCreate: true,
              },
            },
          ],
        },

        {
          label: '투입인력',
          fields: [
            {
              name: 'assignments',
              type: 'join',
              collection: 'staff-assignments',
              on: 'project',
              label: '인력 배정',
              admin: {
                defaultColumns: ['staff', 'roleOnProject', 'allocationPct', 'startDate', 'endDate'],
                allowCreate: true,
              },
            },
          ],
        },

        {
          label: '문서',
          fields: [
            {
              name: 'documents',
              type: 'join',
              collection: 'project-documents',
              on: 'project',
              label: '프로젝트 문서',
              admin: {
                defaultColumns: ['title', 'docType', 'expiryDate'],
                allowCreate: true,
              },
            },
          ],
        },

        {
          label: '활동 로그',
          fields: [
            {
              name: 'activityLog',
              type: 'blocks',
              label: '활동 기록',
              labels: { singular: '활동', plural: '활동 목록' },
              blocks: [
                {
                  slug: 'note',
                  labels: { singular: '메모', plural: '메모' },
                  fields: [
                    { name: 'content', type: 'textarea', required: true, label: '내용' },
                    { name: 'author', type: 'relationship', relationTo: 'users', label: '작성자' },
                  ],
                },
                {
                  slug: 'status-change',
                  labels: { singular: '상태 변경', plural: '상태 변경' },
                  fields: [
                    { name: 'fromStatus', type: 'text', label: '이전 상태' },
                    { name: 'toStatus', type: 'text', label: '변경 상태' },
                    { name: 'reason', type: 'textarea', label: '변경 사유' },
                  ],
                },
                {
                  slug: 'issue',
                  labels: { singular: '이슈', plural: '이슈' },
                  fields: [
                    { name: 'title', type: 'text', required: true, label: '제목' },
                    {
                      name: 'severity',
                      type: 'select',
                      label: '심각도',
                      options: [
                        { label: '낮음', value: 'low' },
                        { label: '보통', value: 'medium' },
                        { label: '높음', value: 'high' },
                        { label: '긴급', value: 'critical' },
                      ],
                    },
                    { name: 'description', type: 'textarea', label: '상세 내용' },
                    { name: 'resolved', type: 'checkbox', label: '해결됨' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  access: {
    read: () => true,
    create: ({ req }) => ['director', 'pm'].includes(req.user?.role as string),
    update: ({ req }) => {
      const role = req.user?.role as string
      if (role === 'director') return true
      if (role === 'pm') {
        const dept = (req.user as any)?.department as string | undefined
        const conditions = [{ assignedPM: { equals: req.user?.id } }]
        if (dept) conditions.push({ department: { equals: dept } } as any)
        return { or: conditions }
      }
      return false
    },
    delete: ({ req }) => req.user?.role === 'director',
  },
}
