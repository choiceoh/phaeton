export function formatCodTarget(dateStr: string): string {
  const date = new Date(dateStr)
  const yy = String(date.getFullYear()).slice(2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const daysLeft = Math.ceil((date.getTime() - Date.now()) / 86400000)
  const label =
    daysLeft > 0
      ? `${daysLeft}일 남음`
      : daysLeft === 0
        ? 'D-Day'
        : `${Math.abs(daysLeft)}일 초과`
  return `${yy}/${mm}/${dd} ${label}`
}
