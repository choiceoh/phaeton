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
    <div className="flex min-h-screen items-center justify-center bg-stone-50/80 px-4">
      <FormProvider {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="w-full max-w-sm space-y-5 rounded-xl border border-stone-200/80 bg-white p-8 shadow-lg animate-scale-in"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-900 text-sm font-bold text-white">T</span>
              <h1 className="text-xl font-bold tracking-tight text-stone-900">Topworks</h1>
            </div>
            <p className="text-sm text-stone-500">업무 플랫폼에 로그인하세요</p>
          </div>

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
