import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/common/Form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLogin } from '@/hooks/useAuth'
import { formatError } from '@/lib/api'

const schema = z.object({
  email: z.string().email('이메일 형식이 올바르지 않습니다'),
  password: z.string().min(1, '비밀번호를 입력하세요'),
})

type LoginForm = z.infer<typeof schema>

export default function LoginPage() {
  const form = useForm<LoginForm>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })
  const login = useLogin()

  function onSubmit(values: LoginForm) {
    login.mutate(values, {
      onError: (err) => toast.error(formatError(err)),
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 shadow-sm animate-scale-in"
        >
          <h1 className="text-xl font-bold text-stone-900">Phaeton</h1>

          <FormField<LoginForm> name="email" label="이메일" required>
            <Input type="email" autoComplete="email" {...form.register('email')} />
          </FormField>

          <FormField<LoginForm> name="password" label="비밀번호" required>
            <Input type="password" autoComplete="current-password" {...form.register('password')} />
          </FormField>

          <Button type="submit" disabled={login.isPending} className="w-full">
            {login.isPending ? '로그인 중...' : '로그인'}
          </Button>
        </form>
      </FormProvider>
    </div>
  )
}
