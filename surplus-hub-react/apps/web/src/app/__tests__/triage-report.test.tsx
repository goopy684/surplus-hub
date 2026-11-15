import { render, screen } from '@testing-library/react'
import type { TriageDiagnosis } from '@repo/core'
import { TriageReport } from '../../components/TriageReport'

const COLD_START_NOTE = '주변 거래 데이터가 아직 적어 품목 기본값으로 추정했습니다.'

const fixture: TriageDiagnosis = {
  id: '12',
  status: 'DIAGNOSED',
  title: '304 스텐 파이프 50A',
  materialLabel: '스테인리스 SUS304',
  conditionGrade: '상',
  imageUrls: [],
  weightKg: 50,
  weightEstimated: false,
  liquidityScore: 85,
  initialScore: 85,
  scoreDelta: 0,
  matchProbability7d: 76,
  expectedDays: 8,
  breakdown: {
    condition: 1, spec: 1, demand: 0.65, materialValue: 0.7, reuseScore: 80.8,
    materialBonus: 4, searchCount: 0, similarActiveCount: 0, similarSoldCount: 0,
  },
  coldStart: true,
  analysisMode: 'rule_based',
  dispositionPath: 'A',
  pathLabel: '원형 재사용 직거래',
  pathReason: '상태와 규격이 명확하고 재사용 수요가 예상됩니다.',
  comparison: {
    mixedWaste: -112500,
    scrap: 70000,
    directSale: 210000,
    netBenefit: 322500,
    priceBasis: 'category_default',
    similarPriceCount: 0,
  },
  shareToken: 'tok',
  createdAt: '2026-11-15T03:00:00Z',
}

// 금액은 여러 span으로 쪼개 렌더하므로 요소의 전체 텍스트로 찾는다
const byFullText = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === 'P' && el.textContent === text

describe('TriageReport', () => {
  it('renders the three comparison amounts, net benefit and path', () => {
    render(<TriageReport diagnosis={fixture} />)
    expect(screen.getByText(byFullText('−112,500원'))).toBeInTheDocument()
    expect(screen.getByText(byFullText('+70,000원'))).toBeInTheDocument()
    expect(screen.getByText(byFullText('+210,000원 입금'))).toBeInTheDocument()
    expect(screen.getByText(byFullText('실질 +322,500원 이득'))).toBeInTheDocument()
    expect(screen.getByText('Path A · 원형 재사용 직거래')).toBeInTheDocument()
    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '85')
  })

  it('shows the cold-start note only when coldStart is true', () => {
    const { rerender } = render(<TriageReport diagnosis={fixture} />)
    expect(screen.getByText(COLD_START_NOTE)).toBeInTheDocument()

    rerender(<TriageReport diagnosis={{ ...fixture, coldStart: false }} />)
    expect(screen.queryByText(COLD_START_NOTE)).toBeNull()
  })

  it('shows the 품목 pill only when category is set', () => {
    const { rerender } = render(<TriageReport diagnosis={{ ...fixture, category: '설비' }} />)
    expect(screen.getByText('설비')).toBeInTheDocument()

    rerender(<TriageReport diagnosis={fixture} />)
    expect(screen.queryByText('설비')).toBeNull()
  })
})
