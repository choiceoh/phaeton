'use client'

import { useLivePreview } from '@payloadcms/live-preview-react'

type Props = {
  initialData: any
  serverURL: string
  children: (data: any) => React.ReactNode
}

export function LivePreviewListener({ initialData, serverURL, children }: Props) {
  const { data } = useLivePreview({
    initialData,
    serverURL,
    depth: 1,
  })

  return <>{children(data)}</>
}
