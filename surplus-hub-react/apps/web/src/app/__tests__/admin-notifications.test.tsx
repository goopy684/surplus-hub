import { render, screen, fireEvent } from '@testing-library/react'
import AdminNotificationsPage from '../admin/notifications/page'
import { usePushStats, usePushHistory, useSendAdminPush } from '@repo/core'

jest.mock('@repo/core', () => ({
  usePushStats: jest.fn(),
  usePushHistory: jest.fn(),
  useSendAdminPush: jest.fn(),
}))

const mutate = jest.fn()

const STATS = {
  totalNotifications: 1200,
  unreadNotifications: 340,
  deviceTokens: { total: 90, active: 80, ios: 30, android: 40, expo: 7, web: 3 },
  sentLast7Days: 12,
}

const HISTORY = [
  {
    id: 1,
    adminId: 2,
    adminName: '운영자',
    title: '점검 공지',
    body: '오늘 밤 점검이 있습니다.',
    target: 'all',
    targeted: 500,
    createdAt: '2026-08-03T00:00:00Z',
  },
]

const fillMessage = () => {
  fireEvent.change(screen.getByLabelText('제목'), { target: { value: '점검 공지' } })
  fireEvent.change(screen.getByLabelText('본문'), { target: { value: '오늘 밤 점검이 있습니다.' } })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(usePushStats as jest.Mock).mockReturnValue({ data: STATS, isLoading: false, isError: false })
  ;(usePushHistory as jest.Mock).mockReturnValue({ data: HISTORY, isLoading: false })
  ;(useSendAdminPush as jest.Mock).mockReturnValue({ mutate, isPending: false, isError: false, data: undefined })
  window.confirm = jest.fn(() => true)
})

describe('Admin Notifications Page — 통계', () => {
  it('renders the stat cards including the per-platform breakdown', () => {
    render(<AdminNotificationsPage />)
    expect(screen.getByText('1,200')).toBeInTheDocument()
    expect(screen.getByText('340')).toBeInTheDocument()
    expect(screen.getByText('80')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('iOS 30 · Android 40 · Expo 7 · Web 3 (등록 90)')).toBeInTheDocument()
  })

  it('shows skeletons while stats are loading', () => {
    ;(usePushStats as jest.Mock).mockReturnValue({ data: undefined, isLoading: true, isError: false })
    render(<AdminNotificationsPage />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(screen.queryByText('1,200')).toBeNull()
  })

  it('surfaces a stats error in Korean', () => {
    ;(usePushStats as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<AdminNotificationsPage />)
    expect(screen.getByText(/푸시 통계를 불러오는 데 실패했습니다/)).toBeInTheDocument()
  })
})

describe('Admin Notifications Page — 발송 폼', () => {
  it('disables submit until the form is valid', () => {
    render(<AdminNotificationsPage />)
    const submit = screen.getByRole('button', { name: '발송' })
    expect(submit).toBeDisabled()

    fillMessage()
    expect(submit).not.toBeDisabled()
  })

  it('requires ids when the target is 특정 사용자 and parses them', () => {
    render(<AdminNotificationsPage />)
    fillMessage()
    fireEvent.click(screen.getByRole('button', { name: '특정 사용자' }))

    const idsInput = screen.getByLabelText('사용자 ID (쉼표로 구분)')
    expect(screen.getByRole('button', { name: '발송' })).toBeDisabled()

    fireEvent.change(idsInput, { target: { value: '1, 2, x, 3' } })
    expect(screen.getByText('인식된 ID 3개: 1, 2, 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '발송' })).not.toBeDisabled()
  })

  it('requires a role when the target is 역할별', () => {
    render(<AdminNotificationsPage />)
    fillMessage()
    fireEvent.click(screen.getByRole('button', { name: '역할별' }))
    expect(screen.getByRole('button', { name: '발송' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText('역할'), { target: { value: 'seller' } })
    expect(screen.getByRole('button', { name: '발송' })).not.toBeDisabled()
  })

  it('sends the exact payload for a user-targeted marketing push', () => {
    render(<AdminNotificationsPage />)
    fillMessage()
    fireEvent.click(screen.getByRole('button', { name: '특정 사용자' }))
    fireEvent.change(screen.getByLabelText('사용자 ID (쉼표로 구분)'), { target: { value: '1, 2, x, 3' } })
    fireEvent.change(screen.getByLabelText('유형'), { target: { value: 'MARKETING' } })
    fireEvent.click(screen.getByRole('button', { name: '발송' }))

    expect(mutate).toHaveBeenCalledWith({
      title: '점검 공지',
      body: '오늘 밤 점검이 있습니다.',
      target: 'users',
      type: 'MARKETING',
      userIds: [1, 2, 3],
    })
  })

  it('dedupes repeated ids in the confirm text and the payload', () => {
    render(<AdminNotificationsPage />)
    fillMessage()
    fireEvent.click(screen.getByRole('button', { name: '특정 사용자' }))
    fireEvent.change(screen.getByLabelText('사용자 ID (쉼표로 구분)'), { target: { value: '7, 7, 7' } })
    expect(screen.getByText('인식된 ID 1개: 7')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '발송' }))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('(1명)'))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ userIds: [7] }))
  })

  it('keeps the focus ring on the irreversible 발송 action', () => {
    render(<AdminNotificationsPage />)
    expect(screen.getByRole('button', { name: '발송' }).className).toContain(
      'focus-visible:ring-2 focus-visible:ring-primary'
    )
  })

  it('sends an all-target payload without userIds or role', () => {
    render(<AdminNotificationsPage />)
    fillMessage()
    fireEvent.click(screen.getByRole('button', { name: '발송' }))

    expect(mutate).toHaveBeenCalledWith({
      title: '점검 공지',
      body: '오늘 밤 점검이 있습니다.',
      target: 'all',
      type: 'SYSTEM',
    })
  })

  it('does not send when the confirm step is cancelled', () => {
    window.confirm = jest.fn(() => false)
    render(<AdminNotificationsPage />)
    fillMessage()
    fireEvent.click(screen.getByRole('button', { name: '발송' }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('전체 사용자'))
    expect(mutate).not.toHaveBeenCalled()
  })

  it('shows the returned counts on success', () => {
    ;(useSendAdminPush as jest.Mock).mockReturnValue({
      mutate,
      isPending: false,
      isError: false,
      data: { targeted: 500, created: 480, pushed: 470, failed: 10, skipped: 20 },
    })
    render(<AdminNotificationsPage />)
    expect(screen.getByText('대상 500 · 생성 480 · 발송 470 · 실패 10 · 제외 20')).toBeInTheDocument()
    expect(screen.getByText('제외는 수신 거부 또는 등록된 기기 없음입니다.')).toBeInTheDocument()
  })

  it('notes the marketing consent requirement', () => {
    render(<AdminNotificationsPage />)
    expect(screen.getByText(/정보통신망법/)).toBeInTheDocument()
  })
})

describe('Admin Notifications Page — 발송 이력', () => {
  it('renders history rows', () => {
    render(<AdminNotificationsPage />)
    expect(screen.getByText('점검 공지')).toBeInTheDocument()
    expect(screen.getByText('운영자')).toBeInTheDocument()
    // 발송 수는 tabular <span>으로 감싸므로 textContent로 확인한다.
    expect(screen.getByText((_, el) => el?.textContent === '전체 사용자 · 500명')).toBeInTheDocument()
  })

  it('renders an empty state when there is no history', () => {
    ;(usePushHistory as jest.Mock).mockReturnValue({ data: [], isLoading: false })
    render(<AdminNotificationsPage />)
    expect(screen.getByText('발송 이력이 없습니다.')).toBeInTheDocument()
  })
})
