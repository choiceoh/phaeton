interface Props {
  label?: string
}

export default function LoadingState({ label = '로딩 중...' }: Props) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted-foreground sm:py-12">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600" />
      <span>{label}</span>
    </div>
  )
}
