import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from 'date-fns'
import { ko } from 'date-fns/locale'

export function formatCodTarget(dateStr: string): string {
  const date = parseISO(dateStr)
  const formatted = format(date, 'yy/MM/dd')
  const daysLeft = differenceInCalendarDays(date, new Date())
  const label =
    daysLeft > 0 ? `${daysLeft}일 남음` : daysLeft === 0 ? 'D-Day' : `${Math.abs(daysLeft)}일 초과`
  return `${formatted} ${label}`
}

export function formatDate(dateStr: string, pattern = 'yyyy-MM-dd'): string {
  return format(parseISO(dateStr), pattern, { locale: ko })
}

export function formatRelativeDate(dateStr: string): string {
  return formatDistanceToNow(parseISO(dateStr), { addSuffix: true, locale: ko })
}

export function daysFromNow(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), new Date())
}
