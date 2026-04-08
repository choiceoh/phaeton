import type { CollectionConfig } from 'payload'

export const Sites: CollectionConfig = {
  slug: 'sites',
  admin: { useAsTitle: 'name' },
  labels: { singular: '현장', plural: '현장 목록' },
  fields: [
    { name: 'name', type: 'text', required: true, label: '현장명' },
    { name: 'address', type: 'text', label: '주소' },
    { name: 'region', type: 'text', label: '지역 (시도)' },
    {
      name: 'coordinates',
      type: 'group',
      label: '좌표',
      fields: [
        { name: 'lat', type: 'number', label: '위도' },
        { name: 'lng', type: 'number', label: '경도' },
      ],
    },
    { name: 'landAreaM2', type: 'number', label: '부지면적 (m²)' },
    { name: 'landType', type: 'text', label: '지목 (임야, 답, 전 등)' },
    { name: 'note', type: 'textarea', label: '비고' },
  ],
}
