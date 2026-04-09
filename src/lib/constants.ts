export const PROJECT_STATUS_LABELS: Record<string, string> = {
  'gen-permit': '발전허가',
  'dev-permit': '개발허가',
  civil: '토목',
  'structural-elec': '구조물 및 전기공사',
  inspection: '사용전 검사',
  'pre-cod': '준공대기',
}

export const MILESTONE_STATUS_LABELS: Record<string, string> = {
  done: '완료',
  active: '진행중',
  pending: '대기',
  blocked: '차단',
  skipped: '건너뜀',
}

export const PROJECT_TYPE_LABELS: Record<string, string> = {
  solar: '태양광',
  rooftop: '루프탑',
  ess: 'ESS',
  hybrid: '하이브리드',
}

export const MILESTONE_STATUS_COLORS: Record<string, string> = {
  done: 'green',
  active: 'blue',
  pending: 'gray',
  blocked: 'amber',
  skipped: 'gray',
}

export const PROJECT_TYPE_COLORS: Record<string, string> = {
  solar: 'amber',
  rooftop: 'sky',
  ess: 'emerald',
  hybrid: 'violet',
}

export const DEPARTMENT_LABELS: Record<string, string> = {
  renewable: '신재생사업본부',
  strategy: '전략사업본부',
  onm: 'O&M사업본부',
  future: '미래사업실',
  planning: '기획조정실',
  solar: '솔라사업실',
  development: '개발사업본부',
}

export const CATEGORY_LABELS: Record<string, string> = {
  admin: '행정·인허가',
  engineering: '설계',
  procurement: '조달',
  construction: '시공',
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  permit: '인허가',
  contract: '계약서',
  drawing: '도면',
  report: '보고서',
  correspondence: '공문',
  other: '기타',
}
