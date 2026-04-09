import type { ColumnDef } from '@tanstack/react-table'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DataTable } from '@/components/common/DataTable'

interface Row {
  id: string
  title: string
}

const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'title', header: '제목' },
]

describe('DataTable', () => {
  it('renders rows from the data prop', () => {
    render(
      <DataTable<Row>
        columns={columns}
        data={[
          { id: '1', title: '첫 번째' },
          { id: '2', title: '두 번째' },
        ]}
      />,
    )

    expect(screen.getByText('첫 번째')).toBeInTheDocument()
    expect(screen.getByText('두 번째')).toBeInTheDocument()
  })

  it('renders an empty state when data is empty', () => {
    render(<DataTable<Row> columns={columns} data={[]} emptyTitle="없습니다" />)
    expect(screen.getByText('없습니다')).toBeInTheDocument()
  })

  it('calls onPageChange when next button is clicked', async () => {
    const onPageChange = vi.fn()
    const user = userEvent.setup()

    render(
      <DataTable<Row>
        columns={columns}
        data={[{ id: '1', title: 'a' }]}
        total={50}
        page={1}
        limit={20}
        onPageChange={onPageChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(onPageChange).toHaveBeenCalledWith(2)
  })
})
