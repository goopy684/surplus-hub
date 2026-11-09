import { render, screen, fireEvent } from '@testing-library/react'
import MaterialDetailPage from '../material/[id]/page'
import {
  useCreateTransaction,
  useCurrentUser,
  useMaterialDetail,
  useMaterialLikeStatus,
} from '@repo/core'

const push = jest.fn()
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn(), back: jest.fn() }),
}))
jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  useCurrentUser: jest.fn(),
  useMaterialDetail: jest.fn(),
  useMaterialLikeStatus: jest.fn(),
  useToggleMaterialLike: () => ({ mutate: jest.fn(), isPending: false }),
  useCreateChatRoom: () => ({ mutateAsync: jest.fn(), isPending: false }),
  useDeleteMaterial: () => ({ mutate: jest.fn(), isPending: false }),
  useCreateTransaction: jest.fn(),
}))

const createTransaction = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  localStorage.clear()
  ;(useMaterialDetail as jest.Mock).mockReturnValue({
    data: {
      id: '7', title: '철근 50개 일괄', description: '남은 자재', price: 3000, status: 'ACTIVE',
      sellerId: '1', category: '철근', tradeMethod: 'DIRECT', location: '서울', quantity: 1, quantityUnit: '개',
      createdAt: '2026-11-08T00:00:00Z',
    },
    isLoading: false,
  })
  ;(useMaterialLikeStatus as jest.Mock).mockReturnValue({ data: undefined })
  ;(useCreateTransaction as jest.Mock).mockReturnValue({
    mutate: createTransaction, isPending: false, isSuccess: false, error: null,
  })
})

describe('SH-38 구매 요청 — 로그인 판정', () => {
  it('토큰이 있으면 /users/me 로딩 중에도 로그인 페이지로 보내지 않고 요청한다', () => {
    localStorage.setItem('access_token', 'tok')
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: undefined, isLoading: true })

    render(<MaterialDetailPage params={{ id: '7' }} />)
    fireEvent.click(screen.getByRole('button', { name: '구매 요청' }))

    expect(push).not.toHaveBeenCalledWith('/sign-in')
    expect(createTransaction).toHaveBeenCalledWith(expect.objectContaining({ material_id: 7 }))
  })

  it('토큰이 없으면 로그인 페이지로 보낸다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: undefined, isLoading: false })

    render(<MaterialDetailPage params={{ id: '7' }} />)
    fireEvent.click(screen.getByRole('button', { name: '구매 요청' }))

    expect(push).toHaveBeenCalledWith('/sign-in')
    expect(createTransaction).not.toHaveBeenCalled()
  })
})

describe('SH-43 분할 판매 후 표시', () => {
  it('수량·가격이 남은 재고 기준임을 표시한다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '2' } })
    render(<MaterialDetailPage params={{ id: '7' }} />)
    expect(screen.getByText('남은 수량')).toBeInTheDocument()
    expect(screen.getByText(/남은 1 개 기준/)).toBeInTheDocument()
  })
})
