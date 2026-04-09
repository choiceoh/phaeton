'use client'

import { Button, Card, Select, SelectItem, Text, TextInput } from '@tremor/react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import type { UpdateProjectData } from '@/app/(frontend)/projects/[id]/actions'
import { updateProject } from '@/app/(frontend)/projects/[id]/actions'
import type { CreateProjectData } from '@/app/(frontend)/projects/actions'
import { createProject } from '@/app/(frontend)/projects/actions'
import { DEPARTMENT_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS } from '@/lib/constants'

interface UserOption {
  id: number
  name: string
}

interface ProjectEditFormProps {
  projectId?: string
  isNew?: boolean
  initial: {
    name: string
    code?: string
    type: string
    status: string
    department?: string | null
    assignedPM?: number | null
    client?: string | null
    capacityKw?: number | null
    codTarget?: string | null
    codActual?: string | null
    epcValue?: number | null
    site?: {
      address?: string | null
      region?: string | null
      landAreaM2?: number | null
      landType?: string | null
      coordinates?: { lat?: number | null; lng?: number | null } | null
    } | null
    moduleCount?: number | null
    moduleType?: string | null
    inverterCapacityKw?: number | null
    turbineCount?: number | null
    turbineModel?: string | null
    hubHeightM?: number | null
    batteryCapacityKwh?: number | null
    pcsCapacityKw?: number | null
  }
  pmUsers?: UserOption[]
  userRole?: string
}

export function ProjectEditForm({
  projectId,
  isNew,
  initial,
  pmUsers = [],
  userRole,
}: ProjectEditFormProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const numStr = (v: number | null | undefined) => (v !== null && v !== undefined ? String(v) : '')

  const [name, setName] = useState(initial.name)
  const [type, setType] = useState(initial.type)
  const [status, setStatus] = useState(initial.status)
  const [department, setDepartment] = useState(initial.department ?? '')
  const [assignedPM, setAssignedPM] = useState(numStr(initial.assignedPM))
  const [client, setClient] = useState(initial.client ?? '')

  const [capacityKw, setCapacityKw] = useState(numStr(initial.capacityKw))
  const [address, setAddress] = useState(initial.site?.address ?? '')
  const [region, setRegion] = useState(initial.site?.region ?? '')
  const [landAreaM2, setLandAreaM2] = useState(numStr(initial.site?.landAreaM2))
  const [landType, setLandType] = useState(initial.site?.landType ?? '')
  const [lat, setLat] = useState(numStr(initial.site?.coordinates?.lat))
  const [lng, setLng] = useState(numStr(initial.site?.coordinates?.lng))

  const [moduleCount, setModuleCount] = useState(numStr(initial.moduleCount))
  const [moduleType, setModuleType] = useState(initial.moduleType ?? '')
  const [inverterCapacityKw, setInverterCapacityKw] = useState(numStr(initial.inverterCapacityKw))

  const [turbineCount, setTurbineCount] = useState(numStr(initial.turbineCount))
  const [turbineModel, setTurbineModel] = useState(initial.turbineModel ?? '')
  const [hubHeightM, setHubHeightM] = useState(numStr(initial.hubHeightM))

  const [batteryCapacityKwh, setBatteryCapacityKwh] = useState(numStr(initial.batteryCapacityKwh))
  const [pcsCapacityKw, setPcsCapacityKw] = useState(numStr(initial.pcsCapacityKw))

  const [codTarget, setCodTarget] = useState(initial.codTarget ?? '')
  const [codActual, setCodActual] = useState(initial.codActual ?? '')
  const [epcValue, setEpcValue] = useState(numStr(initial.epcValue))

  const showSolar = type === 'solar' || type === 'hybrid'
  const showWind = type === 'wind' || type === 'hybrid'
  const showEss = type === 'ess' || type === 'hybrid'

  const toNum = (v: string) => (v ? Number(v) : null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('프로젝트명은 필수입니다')
      return
    }
    if (!type) {
      setError('사업 유형은 필수입니다')
      return
    }

    setSaving(true)
    setError(null)

    if (isNew) {
      const data: CreateProjectData = {
        name,
        type,
        status,
        department: department || undefined,
        assignedPM: toNum(assignedPM),
        client: client || undefined,
        capacityKw: toNum(capacityKw),
        codTarget: codTarget || undefined,
      }
      const result = await createProject(data)
      setSaving(false)
      if ('ok' in result && result.id) {
        router.push(`/projects/${result.id}`)
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다')
      }
    } else {
      const data: UpdateProjectData = {
        name,
        type,
        status,
        department: department || undefined,
        assignedPM: toNum(assignedPM),
        client: client || undefined,
        capacityKw: toNum(capacityKw),
        site: {
          address: address || undefined,
          region: region || undefined,
          landAreaM2: toNum(landAreaM2),
          landType: landType || undefined,
          coordinates: {
            lat: toNum(lat),
            lng: toNum(lng),
          },
        },
        moduleCount: toNum(moduleCount),
        moduleType: moduleType || undefined,
        inverterCapacityKw: toNum(inverterCapacityKw),
        turbineCount: toNum(turbineCount),
        turbineModel: turbineModel || undefined,
        hubHeightM: toNum(hubHeightM),
        batteryCapacityKwh: toNum(batteryCapacityKwh),
        pcsCapacityKw: toNum(pcsCapacityKw),
        codTarget: codTarget || null,
        codActual: codActual || null,
        epcValue: toNum(epcValue),
      }
      const result = await updateProject(projectId!, data)
      setSaving(false)
      if (result.success) {
        router.push(`/projects/${projectId}`)
        router.refresh()
      } else {
        setError(result.error ?? '저장에 실패했습니다')
      }
    }
  }

  const backHref = isNew ? '/projects' : `/projects/${projectId}`

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isNew ? '프로젝트 생성' : '프로젝트 수정'}</h1>
          {initial.code && <Text className="text-gray-500">{initial.code}</Text>}
        </div>
        <button
          onClick={() => router.push(backHref)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          돌아가기
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <p className="text-sm text-red-500">{error}</p>}

        {/* ── 기본정보 ────────────────────────────── */}
        <Card>
          <Text className="mb-4 font-semibold">기본정보</Text>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-600">프로젝트명</label>
              <TextInput value={name} onValueChange={setName} placeholder="프로젝트명" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-gray-600">사업 유형</label>
                <Select value={type} onValueChange={setType}>
                  {Object.entries(PROJECT_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">상태</label>
                <Select value={status} onValueChange={setStatus}>
                  {Object.entries(PROJECT_STATUS_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">담당부서</label>
                <Select value={department} onValueChange={setDepartment} placeholder="선택">
                  {Object.entries(DEPARTMENT_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>
                      {l}
                    </SelectItem>
                  ))}
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-gray-600">담당 PM</label>
                <Select value={assignedPM} onValueChange={setAssignedPM} placeholder="선택">
                  {pmUsers.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-600">발주처 / 사업주</label>
                <TextInput value={client} onValueChange={setClient} placeholder="발주처" />
              </div>
            </div>
          </div>
        </Card>

        {/* ── 현장·설비 ───────────────────────────── */}
        {!isNew && (
          <Card>
            <Text className="mb-4 font-semibold">현장·설비</Text>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-gray-600">설비용량 (kW)</label>
                <TextInput
                  type="number"
                  value={capacityKw}
                  onValueChange={setCapacityKw}
                  placeholder="설비용량"
                />
              </div>

              <Text className="text-xs font-medium text-gray-500">현장 정보</Text>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">주소</label>
                  <TextInput value={address} onValueChange={setAddress} placeholder="주소" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">지역 (시도)</label>
                  <TextInput value={region} onValueChange={setRegion} placeholder="지역" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">부지면적 (m²)</label>
                  <TextInput
                    type="number"
                    value={landAreaM2}
                    onValueChange={setLandAreaM2}
                    placeholder="부지면적"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">지목 (임야, 답 등)</label>
                  <TextInput value={landType} onValueChange={setLandType} placeholder="지목" />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm text-gray-600">위도</label>
                  <TextInput type="number" value={lat} onValueChange={setLat} placeholder="위도" />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-600">경도</label>
                  <TextInput type="number" value={lng} onValueChange={setLng} placeholder="경도" />
                </div>
              </div>

              {showSolar && (
                <>
                  <Text className="text-xs font-medium text-gray-500">태양광 설비</Text>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">모듈 수량</label>
                      <TextInput type="number" value={moduleCount} onValueChange={setModuleCount} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">모듈 종류</label>
                      <TextInput value={moduleType} onValueChange={setModuleType} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">인버터 용량 (kW)</label>
                      <TextInput
                        type="number"
                        value={inverterCapacityKw}
                        onValueChange={setInverterCapacityKw}
                      />
                    </div>
                  </div>
                </>
              )}

              {showWind && (
                <>
                  <Text className="text-xs font-medium text-gray-500">풍력 설비</Text>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">터빈 수량</label>
                      <TextInput
                        type="number"
                        value={turbineCount}
                        onValueChange={setTurbineCount}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">터빈 모델</label>
                      <TextInput value={turbineModel} onValueChange={setTurbineModel} />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">허브 높이 (m)</label>
                      <TextInput type="number" value={hubHeightM} onValueChange={setHubHeightM} />
                    </div>
                  </div>
                </>
              )}

              {showEss && (
                <>
                  <Text className="text-xs font-medium text-gray-500">ESS 설비</Text>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">배터리 용량 (kWh)</label>
                      <TextInput
                        type="number"
                        value={batteryCapacityKwh}
                        onValueChange={setBatteryCapacityKwh}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm text-gray-600">PCS 용량 (kW)</label>
                      <TextInput
                        type="number"
                        value={pcsCapacityKw}
                        onValueChange={setPcsCapacityKw}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* ── 일정 ────────────────────────────────── */}
        <Card>
          <Text className="mb-4 font-semibold">일정</Text>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-gray-600">COD 목표일</label>
              <input
                type="date"
                value={codTarget}
                onChange={(e) => setCodTarget(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {!isNew && (
              <div>
                <label className="mb-1 block text-sm text-gray-600">COD 실제일</label>
                <input
                  type="date"
                  value={codActual}
                  onChange={(e) => setCodActual(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </div>
        </Card>

        {/* ── 재무 (디렉터/PM만) ─────────────────── */}
        {!isNew && (userRole === 'director' || userRole === 'pm') && (
          <Card>
            <Text className="mb-4 font-semibold">재무</Text>
            <div>
              <label className="mb-1 block text-sm text-gray-600">
                도급금액 (원)
                {userRole !== 'director' && (
                  <span className="ml-2 text-xs text-gray-400">열람만 가능</span>
                )}
              </label>
              <TextInput
                type="number"
                value={epcValue}
                onValueChange={setEpcValue}
                disabled={userRole !== 'director'}
              />
            </div>
          </Card>
        )}

        {/* ── 저장 ────────────────────────────────── */}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(backHref)}
            disabled={saving}
          >
            취소
          </Button>
          <Button type="submit" loading={saving}>
            {isNew ? '생성' : '저장'}
          </Button>
        </div>
      </form>
    </div>
  )
}
