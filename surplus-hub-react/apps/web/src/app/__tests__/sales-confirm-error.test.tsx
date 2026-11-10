import { render, screen, fireEvent } from '@testing-library/react'
import SalesPage from '../profile/sales/page'
import { useConfirmTransaction, useCurrentUser, useMyTransactions } from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  useConfirmTransaction: jest.fn(),
  useCurrentUser: jest.fn(),
  useMyTransactions: jest.fn(),
}))
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}))
jest.mock('../../components/AuthGate', () => ({
  AuthGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

const conflict = (detail?: string) => ({ response: { status: 409, data: { detail } } })

describe('SH-37 — seller confirm shows the server reason', () => {
  it('alerts the 409 detail instead of a retry prompt', () => {
    const detail = '남은 재고가 부족해 거래를 확정할 수 없습니다 (요청 50개, 확정 가능 1개)'
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '1' } })
    ;(useMyTransactions as jest.Mock).mockReturnValue({
      data: { data: [{ id: '9', materialId: '7', status: 'PENDING', price: 3000, quantity: 50, createdAt: '' }] },
      isLoading: false,
    })
    ;(useConfirmTransaction as jest.Mock).mockReturnValue({
      mutate: (_id: string, opts: { onError: (e: unknown) => void; onSettled: () => void }) => {
        opts.onError(conflict(detail))
        opts.onSettled()
      },
    })
    const alert = jest.spyOn(window, 'alert').mockImplementation(() => {})

    render(<SalesPage />)
    fireEvent.click(screen.getByRole('button', { name: '확인' }))
    expect(alert).toHaveBeenCalledWith(detail)
  })
})
