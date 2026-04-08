import type { CollectionConfig } from 'payload'

export const ProjectDocuments: CollectionConfig = {
  slug: 'project-documents',
  admin: { useAsTitle: 'title' },
  labels: { singular: '프로젝트 서류', plural: '프로젝트 서류 목록' },
  upload: {
    staticDir: 'uploads/documents',
    mimeTypes: [
      'application/pdf',
      'image/*',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  fields: [
    {
      name: 'project',
      type: 'relationship',
      relationTo: 'projects',
      required: true,
      label: '프로젝트',
    },
    {
      name: 'docType',
      type: 'select',
      required: true,
      label: '서류 유형',
      options: [
        { label: '인허가', value: 'permit' },
        { label: '계약서', value: 'contract' },
        { label: '도면', value: 'drawing' },
        { label: '보고서', value: 'report' },
        { label: '공문', value: 'correspondence' },
        { label: '기타', value: 'other' },
      ],
    },
    { name: 'title', type: 'text', required: true, label: '서류명' },
    { name: 'issueDate', type: 'date', label: '발급일' },
    { name: 'expiryDate', type: 'date', label: '만료일' },
    { name: 'issuedBy', type: 'text', label: '발급기관' },
    { name: 'note', type: 'textarea', label: '비고' },
  ],
}
