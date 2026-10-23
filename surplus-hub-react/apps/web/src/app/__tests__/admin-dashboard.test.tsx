import { render, screen, fireEvent } from '@testing-library/react'
import AdminDashboardPage from '../admin/page'
import {
  useDashboardSummary,
  useAdminUserStats,
  useAdminMaterialStats,
  useAdminTransactionStats,
  useAdminActiveUserStats,
  useExportCsv,
} from '@repo/core'

jest.mock('@repo/core', () => ({
  useDashboardSummary: jest.fn(),
  useAdminUserStats: jest.fn(),
  useAdminMaterialStats: jest.fn(),
  useAdminTransactionStats: jest.fn(),
  useAdminActiveUserStats: jest.fn(),
  useExportCsv: jest.fn(),
}))

const stats = (data: { date: string; count: number }[] | undefined, overrides = {}) => ({
  data: data ? { data, period: 'week' } : undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  ...overrides,
})

const mutate = jest.fn()

const setup = (points: { date: string; count: number }[] | undefined) => {
  ;(useDashboardSummary as jest.Mock).mockReturnValue({
    data: { totalUsers: 10, newUsersToday: 1, dau: 2, wau: 4, mau: 5, totalMaterials: 3, activeMaterials: 2, totalTransactions: 4, completedTransactions: 4, completedTransactionAmount: 1234000, pendingReports: 0 },
    isLoading: false,
    isError: false,
  })
  ;(useAdminUserStats as jest.Mock).mockReturnValue(stats(points))
  ;(useAdminMaterialStats as jest.Mock).mockReturnValue(stats(points))
  ;(useAdminTransactionStats as jest.Mock).mockReturnValue(stats(points))
  ;(useAdminActiveUserStats as jest.Mock).mockReturnValue(stats(points))
  ;(useExportCsv as jest.Mock).mockReturnValue({
    mutate,
    isPending: false,
    isError: false,
    error: null,
    variables: undefined,
  })
}

describe('Admin Dashboard Page', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders DAU/WAU/MAU and completed transaction amount KPIs', () => {
    setup([])
    render(<AdminDashboardPage />)

    expect(screen.getByText('DAU').nextSibling).toHaveTextContent('2')
    expect(screen.getByText('WAU').nextSibling).toHaveTextContent('4')
    expect(screen.getByText('MAU').nextSibling).toHaveTextContent('5')
    expect(screen.getByText('₩1,234,000')).toBeInTheDocument()
  })

  it('renders a bar per data point for all four charts', () => {
    setup([
      { date: '2026-08-01', count: 3 },
      { date: '2026-08-02', count: 7 },
    ])
    render(<AdminDashboardPage />)

    expect(screen.getByText('사용자 증가 추이')).toBeInTheDocument()
    expect(screen.getByText('자재 등록 현황')).toBeInTheDocument()
    expect(screen.getByText('거래 추이')).toBeInTheDocument()
    expect(screen.getByText('활성 사용자')).toBeInTheDocument()

    // 2 points x 4 charts
    const bars = screen.getAllByTestId('trend-bar')
    expect(bars).toHaveLength(8)
    expect(bars[1]).toHaveStyle({ height: '100%' })
    // 3 / 7 of the max
    expect(bars[0]?.getAttribute('style')).toContain('42.85')
  })

  it('renders empty state when there are no data points', () => {
    setup([])
    render(<AdminDashboardPage />)

    expect(screen.getAllByText('표시할 데이터가 없습니다.')).toHaveLength(4)
    expect(screen.queryAllByTestId('trend-bar')).toHaveLength(0)
  })

  it('renders all-zero counts without dividing by zero', () => {
    setup([
      { date: '2026-08-01', count: 0 },
      { date: '2026-08-02', count: 0 },
    ])
    render(<AdminDashboardPage />)

    const bars = screen.getAllByTestId('trend-bar')
    expect(bars).toHaveLength(8)
    bars.forEach((bar) => expect(bar).toHaveStyle({ height: '0%' }))
  })

  it('shows a skeleton while stats are loading', () => {
    setup([{ date: '2026-08-01', count: 1 }])
    ;(useAdminUserStats as jest.Mock).mockReturnValue(stats(undefined, { isLoading: true, isFetching: true }))
    render(<AdminDashboardPage />)

    // user chart is a skeleton, the other three still render their single bar
    expect(screen.queryAllByTestId('trend-bar')).toHaveLength(3)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('switching period re-queries with the new period', () => {
    setup([{ date: '2026-08-01', count: 1 }])
    render(<AdminDashboardPage />)

    expect(useAdminUserStats).toHaveBeenCalledWith('week')
    fireEvent.click(screen.getByText('월'))
    expect(useAdminUserStats).toHaveBeenLastCalledWith('month')
    expect(useAdminTransactionStats).toHaveBeenLastCalledWith('month')
    expect(useAdminActiveUserStats).toHaveBeenLastCalledWith('month')
  })

  it('invokes the export mutation when an export button is clicked', () => {
    setup([{ date: '2026-08-01', count: 1 }])
    render(<AdminDashboardPage />)

    fireEvent.click(screen.getByText('사용자 CSV'))
    expect(mutate).toHaveBeenCalledWith('users', expect.objectContaining({ onSuccess: expect.any(Function) }))

    fireEvent.click(screen.getByText('거래 CSV'))
    expect(mutate).toHaveBeenLastCalledWith('transactions', expect.anything())
  })

  it('surfaces an export failure instead of failing silently', () => {
    setup([{ date: '2026-08-01', count: 1 }])
    ;(useExportCsv as jest.Mock).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new Error('Forbidden'),
      variables: 'users',
    })
    render(<AdminDashboardPage />)

    expect(screen.getByText(/내려받기에 실패했습니다/)).toBeInTheDocument()
    expect(screen.getByText(/Forbidden/)).toBeInTheDocument()
  })
})
