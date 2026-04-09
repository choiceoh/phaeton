import { RichText } from '@payloadcms/richtext-lexical/react'

interface Props {
  content: any
}

export function RichTextBlock({ content }: Props) {
  if (!content) return null
  return (
    <div className="prose max-w-none prose-stone">
      <RichText data={content} />
    </div>
  )
}
