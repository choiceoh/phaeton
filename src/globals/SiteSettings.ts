import type { GlobalConfig } from 'payload'

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: '사이트 설정',
  access: {
    read: () => true,
    update: ({ req: { user } }) => {
      if (!user) return false
      return ['director', 'pm'].includes(user.role as string)
    },
  },
  fields: [
    {
      type: 'group',
      name: 'banner',
      label: '공지 배너',
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: '배너 표시',
          defaultValue: false,
        },
        {
          name: 'type',
          type: 'select',
          label: '유형',
          defaultValue: 'info',
          options: [
            { label: '정보 (파란색)', value: 'info' },
            { label: '경고 (노란색)', value: 'warning' },
            { label: '긴급 (빨간색)', value: 'urgent' },
          ],
        },
        {
          name: 'text',
          type: 'text',
          label: '배너 내용',
        },
      ],
    },
    {
      type: 'group',
      name: 'dashboard',
      label: '대시보드',
      fields: [
        {
          name: 'alertSectionTitle',
          type: 'text',
          label: '알림 섹션 제목',
          defaultValue: '알림',
        },
        {
          name: 'showStatusCards',
          type: 'checkbox',
          label: '상태 카드 표시',
          defaultValue: true,
        },
        {
          name: 'showProjectGrid',
          type: 'checkbox',
          label: '프로젝트 목록 표시',
          defaultValue: true,
        },
        {
          name: 'showAlertPanel',
          type: 'checkbox',
          label: '알림 패널 표시',
          defaultValue: true,
        },
      ],
    },
    {
      type: 'group',
      name: 'navigation',
      label: '네비게이션',
      fields: [
        {
          name: 'dashboardLabel',
          type: 'text',
          label: '대시보드 메뉴명',
          defaultValue: '대시보드',
        },
        {
          name: 'myProjectsLabel',
          type: 'text',
          label: '내 업무 메뉴명',
          defaultValue: '내 업무',
        },
        {
          name: 'projectsLabel',
          type: 'text',
          label: '프로젝트 메뉴명',
          defaultValue: '프로젝트',
        },
        {
          name: 'staffLabel',
          type: 'text',
          label: '인력 현황 메뉴명',
          defaultValue: '인력 현황',
        },
        {
          name: 'alertsLabel',
          type: 'text',
          label: '알림 메뉴명',
          defaultValue: '알림',
        },
      ],
    },
  ],
}
