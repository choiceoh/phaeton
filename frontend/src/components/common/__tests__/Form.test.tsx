import { zodResolver } from '@hookform/resolvers/zod'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FormProvider, useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { FormField } from '@/components/common/Form'
import { Input } from '@/components/ui/input'

const schema = z.object({
  email: z.string().email('이메일 형식이 올바르지 않습니다'),
})

type FormValues = z.infer<typeof schema>

function TestForm({ onSubmit }: { onSubmit?: (values: FormValues) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  })

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => onSubmit?.(values))}>
        <FormField<FormValues> name="email" label="이메일" required>
          <Input {...form.register('email')} />
        </FormField>
        <button type="submit">제출</button>
      </form>
    </FormProvider>
  )
}

describe('FormField', () => {
  it('renders the label and required marker', () => {
    render(<TestForm />)

    expect(screen.getByText('이메일')).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows the validation error after a failed submit', async () => {
    const user = userEvent.setup()
    render(<TestForm />)

    await user.type(screen.getByRole('textbox'), 'not-an-email')
    await user.click(screen.getByRole('button', { name: '제출' }))

    expect(await screen.findByText('이메일 형식이 올바르지 않습니다')).toBeInTheDocument()
  })
})
