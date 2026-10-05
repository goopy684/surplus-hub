import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import MaterialEditPage from '../material/[id]/edit/page'
import { useChatRooms, useCurrentUser, useMaterialDetail, useUpdateMaterial } from '@repo/core'

jest.mock('@repo/core', () => ({
  useChatRooms: jest.fn(),
  useCurrentUser: jest.fn(),
  useMaterialDetail: jest.fn(),
  useUpdateMaterial: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))
jest.mock('../../components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const mutateAsync = jest.fn().mockResolvedValue({})
const room = (id: string, materialId: string, userId: string, name: string) => ({
  id,
  materialId,
  otherUser: { id: userId, name },
  unreadCount: 0,
  updatedAt: '',
})

beforeEach(() => {
  jest.clearAllMocks()
  ;(useMaterialDetail as jest.Mock).mockReturnValue({
    data: {
      id: '7', title: '철근 D13', description: '남은 자재', price: 50000, status: 'ACTIVE',
      sellerId: '1', category: '철근', tradeMethod: 'DIRECT', location: '서울', quantity: 1, quantityUnit: '개',
    },
    isLoading: false,
  })
  ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '1' } })
  ;(useUpdateMaterial as jest.Mock).mockReturnValue({ mutateAsync, isPending: false })
  ;(useChatRooms as jest.Mock).mockReturnValue({
    data: { data: [room('a', '7', '12', '김구매'), room('b', '7', '12', '김구매'), room('c', '8', '13', '다른 자재 상대')] },
  })
})

describe('Material edit — buyer on 거래완료', () => {
  it('offers this listing\'s chat partners and sends the chosen buyerId', async () => {
    render(<MaterialEditPage params={{ id: '7' }} />)
    expect(screen.queryByLabelText('구매자 선택')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '거래완료' }))
    const select = screen.getByLabelText('구매자 선택')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      '선택 안 함 (채팅 외 거래)',
      '김구매',
    ])

    fireEvent.change(select, { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: '수정 완료' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ status: 'SOLD', buyerId: 12 })
  })

  it('omits buyerId when no buyer is picked', async () => {
    render(<MaterialEditPage params={{ id: '7' }} />)
    fireEvent.click(screen.getByRole('button', { name: '거래완료' }))
    fireEvent.click(screen.getByRole('button', { name: '수정 완료' }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalled())
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty('buyerId')
  })
})
