import type { CollectionConfig } from 'payload'

export const Staff: CollectionConfig = {
  slug: 'staff',
  admin: { useAsTitle: 'name' },
  labels: { singular: '인력', plural: '인력 목록' },
  fields: [
    { name: 'name', type: 'text', required: true, label: '이름' },
    { name: 'role', type: 'text', label: '직무 (PM, 전기, 토목 등)' },
    { name: 'phone', type: 'text', label: '전화번호' },
    { name: 'email', type: 'email', label: '이메일' },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      unique: true,
      label: '시스템 계정',
      admin: { description: '로그인 계정과 연결 (선택사항 — 계정이 없는 인력은 비워둠)' },
    },
    { name: 'isActive', type: 'checkbox', defaultValue: true, label: '활성' },
  ],
}
