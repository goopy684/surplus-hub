import { fireEvent, render, screen } from '@testing-library/react'
import WantedListPage from '../wanted/page'
import WantedNewPage from '../wanted/new/page'
import WantedDetailPage from '../wanted/[id]/page'
import Home from '../page'
import {
  resolveNotificationTarget,
  useCreateWanted,
  useCurrentUser,
  useMaterials,
  useWanted,
  useWantedList,
} from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  useWantedList: jest.fn(),
  useWanted: jest.fn(),
  useCreateWanted: jest.fn(),
  useCloseWanted: () => ({ mutate: jest.fn(), isPending: false }),
  useCurrentUser: jest.fn(),
  useMaterials: jest.fn(),
  useHotDemands: () => ({ data: undefined }),
}))

const wanted = (overrides = {}) => ({
  id: '12', title: 'SUS304 파이프 50A', description: '20m 정도', category: '설비',
  quantity: 20, quantityUnit: 'm', budgetMax: 300000, locationAddress: '경기 안산시 단원구',
  radiusKm: 30, status: 'OPEN', expiresAt: '2026-12-27T01:00:00+00:00', createdAt: '2026-11-27T01:00:00+00:00',
  requester: { id: '3', name: '시화배관자재' }, matches: [],
  ...overrides,
})

describe('구해요 목록', () => {
  it('요청을 카드로 보여준다', () => {
    ;(useWantedList as jest.Mock).mockReturnValue({ data: { data: [wanted()], hasMore: false }, isLoading: false })
    render(<WantedListPage />)
    expect(screen.getByText('SUS304 파이프 50A').closest('a')).toHaveAttribute('href', '/wanted/12')
    expect(screen.getByText('수량 20 m · 예산 300,000원 이하')).toBeInTheDocument()
  })

  it('요청이 없으면 빈 상태 문구를 보여준다', () => {
    ;(useWantedList as jest.Mock).mockReturnValue({ data: { data: [], hasMore: false }, isLoading: false })
    render(<WantedListPage />)
    expect(screen.getByText('아직 올라온 구매 요청이 없어요')).toBeInTheDocument()
  })
})

describe('구해요 등록 폼', () => {
  const mutateAsync = jest.fn()
  beforeEach(() => {
    mutateAsync.mockReset()
    ;(useCreateWanted as jest.Mock).mockReturnValue({ mutateAsync, isPending: false })
  })

  it('제목·품목이 없으면 보내지 않는다', () => {
    render(<WantedNewPage />)
    fireEvent.click(screen.getByRole('button', { name: '구해요 등록하기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('제목은 2~100자로 입력해주세요.')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('현재 위치가 없으면 보내지 않는다 (반경 매칭 기준)', () => {
    render(<WantedNewPage />)
    fireEvent.change(screen.getByLabelText('제목'), { target: { value: 'SUS304 파이프' } })
    fireEvent.click(screen.getByRole('button', { name: '설비' }))
    fireEvent.change(screen.getByLabelText('지역'), { target: { value: '경기 안산시' } })
    fireEvent.click(screen.getByRole('button', { name: '구해요 등록하기' }))
    expect(screen.getByRole('alert')).toHaveTextContent('현재 위치를 추가해주세요')
    expect(mutateAsync).not.toHaveBeenCalled()
  })
})

describe('구해요 상세', () => {
  beforeEach(() => {
    ;(useWanted as jest.Mock).mockReturnValue({ data: wanted(), isLoading: false })
  })

  it('요청자 본인에게는 마감하기를 보여준다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '3' } })
    render(<WantedDetailPage params={{ id: '12' }} />)
    expect(screen.getByRole('button', { name: '마감하기' })).toBeInTheDocument()
    expect(screen.queryByText('맞는 자재 등록하기')).toBeNull()
    expect(screen.queryByRole('button', { name: '구매 요청 신고' })).toBeNull()
  })

  it('다른 사용자에게는 맞는 자재 등록하기와 신고를 보여준다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '99' } })
    render(<WantedDetailPage params={{ id: '12' }} />)
    expect(screen.getByText('맞는 자재 등록하기').closest('a')).toHaveAttribute('href', '/register')
    expect(screen.getByRole('button', { name: '구매 요청 신고' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '마감하기' })).toBeNull()
  })

  it('마감된 요청은 배지만 보이고 행동 버튼은 숨긴다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '99' } })
    ;(useWanted as jest.Mock).mockReturnValue({ data: wanted({ status: 'CLOSED' }), isLoading: false })
    render(<WantedDetailPage params={{ id: '12' }} />)
    expect(screen.getByText('마감')).toBeInTheDocument()
    expect(screen.queryByText('맞는 자재 등록하기')).toBeNull()
  })
})

describe('홈 구해요 섹션 · 알림 이동', () => {
  it('열린 요청이 있으면 홈에 보여준다', () => {
    ;(useMaterials as jest.Mock).mockReturnValue({ isLoading: false, data: { data: [] } })
    ;(useWantedList as jest.Mock).mockReturnValue({ data: { data: [wanted()], hasMore: false } })
    render(<Home />)
    expect(screen.getByText('새로 올라온 구해요')).toBeInTheDocument()
    expect(screen.getByText('전체 보기').closest('a')).toHaveAttribute('href', '/wanted')
  })

  it('WANTED_MATCH 알림은 wanted 대상으로 정규화된다', () => {
    expect(resolveNotificationTarget({ referenceType: 'wanted', referenceId: 12 })).toEqual({ kind: 'wanted', id: '12' })
  })
})
