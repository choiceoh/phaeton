import { Text } from '@tremor/react'

interface Props {
  text: string
  level?: 'h1' | 'h2' | 'h3'
  description?: string
}

const STYLES = {
  h1: 'text-2xl font-bold',
  h2: 'text-xl font-semibold',
  h3: 'text-lg font-medium',
} as const

export function HeadingBlock({ text, level = 'h2', description }: Props) {
  const Tag = level
  return (
    <div>
      <Tag className={STYLES[level]}>{text}</Tag>
      {description && <Text className="mt-1 text-stone-500">{description}</Text>}
    </div>
  )
}
