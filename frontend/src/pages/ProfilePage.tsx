import { zodResolver } from '@hookform/resolvers/zod'
import { FormProvider, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/common/Form'
import LoadingState from '@/components/common/LoadingState'
import PageHeader from '@/components/common/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { useCurrentUser } from '@/hooks/useAuth'
import { useDepartments } from '@/hooks/useDepartments'
import { useSubsidiaries } from '@/hooks/useSubsidiaries'
import { useUpdateMe, useChangePassword } from '@/hooks/useUsers'
import { formatError } from '@/lib/api'
import { ROLE_LABELS } from '@/lib/constants'

const profileSchema = z.object({
  name: z.string().min(1, '이름을 입력하세요'),
  phone: z.string().optional(),
})

const passwordSchema = z
  .object({
    current_password: z.string().min(1, '현재 비밀번호를 입력하세요'),
    new_password: z.string().min(6, '6자 이상 입력하세요'),
    confirm_password: z.string().min(1, '비밀번호 확인을 입력하세요'),
  })
  .refine((v) => v.new_password === v.confirm_password, {
    message: '비밀번호가 일치하지 않습니다',
    path: ['confirm_password'],
  })

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const { data: user, isLoading } = useCurrentUser()
  const { data: departments } = useDepartments()
  const { data: subsidiaries } = useSubsidiaries()
  const updateMe = useUpdateMe()
  const changePw = useChangePassword()

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { name: user?.name ?? '', phone: user?.phone ?? '' },
  })

  const pwForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  })

  const deptName = user?.department_id
    ? departments?.find((d) => d.id === user.department_id)?.name
    : undefined
  const subName = user?.subsidiary_id
    ? subsidiaries?.find((s) => s.id === user.subsidiary_id)?.name
    : undefined

  function onProfileSubmit(values: ProfileForm) {
    updateMe.mutate(values, {
      onSuccess: () => toast.success('프로필이 수정되었습니다'),
      onError: (err) => toast.error(formatError(err)),
    })
  }

  function onPasswordSubmit(values: PasswordForm) {
    changePw.mutate(
      { current_password: values.current_password, new_password: values.new_password },
      {
        onSuccess: () => {
          toast.success('비밀번호가 변경되었습니다')
          pwForm.reset()
        },
        onError: (err) => toast.error(formatError(err)),
      },
    )
  }

  if (isLoading) return <LoadingState />
  if (!user) return null

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <PageHeader title="내 정보" />

      {/* Read-only info */}
      <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">이메일</span>
            <p className="font-medium">{user.email}</p>
          </div>
          <div>
            <span className="text-muted-foreground">역할</span>
            <p className="font-medium">{ROLE_LABELS[user.role] ?? user.role}</p>
          </div>
          {subName && (
            <div>
              <span className="text-muted-foreground">계열사</span>
              <p className="font-medium">{subName}</p>
            </div>
          )}
          {deptName && (
            <div>
              <span className="text-muted-foreground">부서</span>
              <p className="font-medium">{deptName}</p>
            </div>
          )}
          {user.position && (
            <div>
              <span className="text-muted-foreground">직위</span>
              <p className="font-medium">{user.position}</p>
            </div>
          )}
          {user.title && (
            <div>
              <span className="text-muted-foreground">직책</span>
              <p className="font-medium">{user.title}</p>
            </div>
          )}
          {user.joined_at && (
            <div>
              <span className="text-muted-foreground">입사일</span>
              <p className="font-medium">{user.joined_at}</p>
            </div>
          )}
        </div>
      </div>

      {/* Editable profile */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold">프로필 수정</h2>
        <FormProvider {...profileForm}>
          <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
            <FormField<ProfileForm> name="name" label="이름" required>
              <Input {...profileForm.register('name')} />
            </FormField>
            <FormField<ProfileForm> name="phone" label="전화번호">
              <Input type="tel" {...profileForm.register('phone')} />
            </FormField>
            <Button type="submit" disabled={updateMe.isPending}>
              {updateMe.isPending ? '저장 중...' : '저장'}
            </Button>
          </form>
        </FormProvider>
      </div>

      <Separator />

      {/* Password change */}
      <div className="rounded-lg border border-stone-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold">비밀번호 변경</h2>
        <FormProvider {...pwForm}>
          <form onSubmit={pwForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
            <FormField<PasswordForm> name="current_password" label="현재 비밀번호" required>
              <Input type="password" {...pwForm.register('current_password')} />
            </FormField>
            <FormField<PasswordForm> name="new_password" label="새 비밀번호" required>
              <Input type="password" {...pwForm.register('new_password')} />
            </FormField>
            <FormField<PasswordForm> name="confirm_password" label="비밀번호 확인" required>
              <Input type="password" {...pwForm.register('confirm_password')} />
            </FormField>
            <Button type="submit" disabled={changePw.isPending}>
              {changePw.isPending ? '변경 중...' : '비밀번호 변경'}
            </Button>
          </form>
        </FormProvider>
      </div>
    </div>
  )
}
