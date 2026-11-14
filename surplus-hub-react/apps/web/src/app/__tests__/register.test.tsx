import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RegisterPage from '../register/page'
import {
  analyzeImage,
  evaluateDisposal,
  generateDescription,
  overrideDisposalRoute,
  suggestPrice,
  uploadImage,
  useCreateMaterial,
  type AiDisposalEvaluation,
  type DisposalRoute,
} from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  analyzeImage: jest.fn(),
  evaluateDisposal: jest.fn(),
  overrideDisposalRoute: jest.fn(),
  generateDescription: jest.fn(),
  suggestPrice: jest.fn(),
  uploadImage: jest.fn(),
  useCreateMaterial: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))
jest.mock('../../components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const createMaterial = jest.fn().mockResolvedValue({})

const advisory = (route: DisposalRoute, extra: Partial<AiDisposalEvaluation> = {}): AiDisposalEvaluation => ({
  advisoryId: 41,
  recommendedRoute: route,
  selectedRoute: route,
  canOverrideToReuse: true,
  headline: route === 'REUSE' ? '직거래 등록 가능' : route === 'RECYCLE' ? '재활용 연계 권장' : '직거래 등록 차단 · 고철·폐기 처리',
  reasoning: '판정 근거 (유사 매물 0건, 체결 실적 0건)',
  evidence: {
    conditionGrade: '하',
    category: '문/창호',
    damageLevel: 'NONE',
    isMixedWaste: false,
    recyclableMaterial: route === 'RECYCLE' ? '알루미늄' : undefined,
    similarActiveCount: 2,
    similarSoldCount: 1,
    completedTradeCount: 1,
  },
  steps: route === 'REUSE' ? [] : ['재질별로 분리하세요.', '처리 업체를 조회하세요.', '계근 매각하세요.'],
  channels:
    route === 'REUSE'
      ? []
      : [{ name: '한국환경공단 순환자원정보센터', description: '공공 플랫폼', url: 'https://www.re.or.kr' }],
  ...extra,
})

beforeEach(() => {
  jest.clearAllMocks()
  window.alert = jest.fn()
  ;(useCreateMaterial as jest.Mock).mockReturnValue({ mutateAsync: createMaterial, isPending: false })
  ;(analyzeImage as jest.Mock).mockResolvedValue({
    title: '알루미늄 샷시',
    category: '문/창호',
    description: '',
    condition: '하',
    tags: ['샷시'],
    materialType: '알루미늄 창호',
    damageLevel: 'NONE',
    isMixedWaste: false,
    recyclableMaterial: '알루미늄',
  })
  ;(generateDescription as jest.Mock).mockResolvedValue({ description: 'AI 판매글' })
  ;(suggestPrice as jest.Mock).mockResolvedValue({
    price: 30000,
    marketPrice: { min: 20000, ideal: 30000, max: 40000, similarCount: 3 },
  })
  ;(uploadImage as jest.Mock).mockResolvedValue('https://cdn.example.com/a.jpg')
})

async function analyze(route: DisposalRoute, extra: Partial<AiDisposalEvaluation> = {}) {
  ;(evaluateDisposal as jest.Mock).mockResolvedValue(advisory(route, extra))
  const { container } = render(<RegisterPage />)
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  fireEvent.change(input, { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } })
  fireEvent.click(await screen.findByRole('button', { name: /AI 자동 입력 시작/ }))
  await screen.findByText('모듈 0 · 처분 경로 판별 게이트')
}

const routeButton = (label: RegExp) => screen.getByRole('button', { name: label })

describe('Register — 모듈 0 처분 경로 판별 게이트', () => {
  it('REUSE: generates listing text and price, then submits with advisoryId', async () => {
    await analyze('REUSE')

    expect(evaluateDisposal).toHaveBeenCalledWith(
      expect.objectContaining({ title: '알루미늄 샷시', condition: '하', recyclableMaterial: '알루미늄' })
    )
    expect(generateDescription).toHaveBeenCalledTimes(1)
    expect(suggestPrice).toHaveBeenCalledTimes(1)
    expect(screen.getByText('유사 매물 3건')).toBeInTheDocument()
    expect(screen.getByText('체결 실적 1건')).toBeInTheDocument()
    expect(routeButton(/Reuse · 직거래 등록/)).toHaveAttribute('aria-pressed', 'true')
    expect(routeButton(/Reuse · 직거래 등록/)).toHaveTextContent('AI 판정')

    fireEvent.click(await screen.findByRole('button', { name: '등록하기' }))
    await waitFor(() => expect(createMaterial).toHaveBeenCalled())
    expect(uploadImage).toHaveBeenCalledTimes(1)
    expect(createMaterial.mock.calls[0][0]).toMatchObject({ advisoryId: 41, description: 'AI 판매글', price: 30000 })
  })

  it('RECYCLE: skips LLM calls and photo upload, hides the form, shows the guide; Reuse override lazy-loads', async () => {
    await analyze('RECYCLE')

    expect(generateDescription).not.toHaveBeenCalled()
    expect(suggestPrice).not.toHaveBeenCalled()
    expect(uploadImage).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '등록하기' })).toBeNull()
    expect(screen.getByText('소재 가치: 알루미늄')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /re\.or\.kr/ })).toHaveAttribute('href', 'https://www.re.or.kr')
    expect(screen.getByRole('button', { name: '다른 자재 분석하기' })).toBeInTheDocument()

    ;(overrideDisposalRoute as jest.Mock).mockResolvedValue(
      advisory('REUSE', { recommendedRoute: 'RECYCLE', selectedRoute: 'REUSE' })
    )
    fireEvent.click(routeButton(/Reuse · 직거래 등록/))

    expect(await screen.findByRole('button', { name: '등록하기' })).toBeInTheDocument()
    expect(overrideDisposalRoute).toHaveBeenCalledWith(41, 'REUSE', undefined)
    expect(generateDescription).toHaveBeenCalledTimes(1)
    expect(suggestPrice).toHaveBeenCalledTimes(1)
    expect(routeButton(/Recycle · 재활용 연계/)).toHaveTextContent('AI 판정')
  })

  it('SCRAP: blocks registration and asks for a reason before overriding to Reuse', async () => {
    await analyze('SCRAP')

    expect(screen.queryByRole('button', { name: '등록하기' })).toBeNull()
    expect(screen.getByText(/직거래 매물 등록이 차단되었습니다/)).toBeInTheDocument()
    expect(generateDescription).not.toHaveBeenCalled()

    fireEvent.click(routeButton(/Reuse · 직거래 등록/))
    expect(overrideDisposalRoute).not.toHaveBeenCalled()

    ;(overrideDisposalRoute as jest.Mock).mockResolvedValue(
      advisory('REUSE', { recommendedRoute: 'SCRAP', selectedRoute: 'REUSE', overrideReason: '외포장 손상(내부 자재 정상)' })
    )
    fireEvent.click(screen.getByRole('button', { name: '외포장 손상(내부 자재 정상)' }))

    expect(await screen.findByRole('button', { name: '등록하기' })).toBeInTheDocument()
    expect(overrideDisposalRoute).toHaveBeenCalledWith(41, 'REUSE', '외포장 손상(내부 자재 정상)')
    expect(generateDescription).toHaveBeenCalledTimes(1)
  })

  it('SCRAP (mixed construction waste): Reuse override is disabled', async () => {
    await analyze('SCRAP', { canOverrideToReuse: false })

    expect(routeButton(/Reuse · 직거래 등록/)).toBeDisabled()
    expect(screen.getByText(/혼합 건설폐기물은 법적으로 직거래 매물로 등록할 수 없어/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '등록하기' })).toBeNull()
  })

  it('Override: shows the server reason when the route change is rejected', async () => {
    await analyze('RECYCLE')
    ;(overrideDisposalRoute as jest.Mock).mockRejectedValue({
      response: { data: { detail: '혼합 건설폐기물은 법적으로 직거래 매물로 등록할 수 없습니다.' } },
    })
    fireEvent.click(routeButton(/Reuse · 직거래 등록/))

    expect(await screen.findByRole('alert')).toHaveTextContent('혼합 건설폐기물은 법적으로 직거래 매물로 등록할 수 없습니다.')
    expect(generateDescription).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: '등록하기' })).toBeNull()
  })

  it('Override: opens the form for manual input when lazy generation fails after the route changed', async () => {
    await analyze('RECYCLE')
    ;(overrideDisposalRoute as jest.Mock).mockResolvedValue(
      advisory('REUSE', { recommendedRoute: 'RECYCLE', selectedRoute: 'REUSE' })
    )
    ;(generateDescription as jest.Mock).mockRejectedValue(new Error('LLM down'))
    fireEvent.click(routeButton(/Reuse · 직거래 등록/))

    expect(await screen.findByRole('button', { name: '등록하기' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('직접 입력해 주세요')
  })
})
