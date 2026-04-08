import type { CollectionConfig } from 'payload'

import { validateAssignment } from '../hooks/validateAssignment'

export const StaffAssignments: CollectionConfig = {
  slug: 'staff-assignments',
  labels: { singular: '인력 배치', plural: '인력 배치 목록' },
  hooks: {
    beforeChange: [validateAssignment],
  },
  fields: [
    { name: 'staff', type: 'relationship', relationTo: 'staff', required: true, label: '인력' },
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      label: '프로젝트',
    },
    { name: 'roleOnProject', type: 'text', label: '프로젝트 내 역할' },
    { name: 'startDate', type: 'date', required: true, label: '시작일' },
    { name: 'endDate', type: 'date', label: '종료일' },
    {
      name: 'allocationPct',
      type: 'number',
      defaultValue: 100,
      min: 0,
      max: 200,
      label: '할당률 (%)',
      admin: { description: '100 = 전담, 50 = 반일 배정' },
    },
    { name: 'note', type: 'textarea', label: '비고' },
  ],
}
