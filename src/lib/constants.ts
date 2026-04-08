export const PROJECT_STATUS_LABELS: Record<string, string> = {
  planning: '기획',
  permit: '인허가',
  construction: '시공',
  testing: '시운전',
  cod: '운영',
  decommission: '해체',
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
  wind: '풍력',
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
  wind: 'sky',
  ess: 'emerald',
  hybrid: 'violet',
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
