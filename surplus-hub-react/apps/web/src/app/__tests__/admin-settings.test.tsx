import { render, screen, fireEvent } from '@testing-library/react'
import AdminSettingsPage from '../admin/settings/page'
import { useAdminUsers, useAuditLogs, useUpdateUserRole } from '@repo/core'
import { useAuth } from '../../contexts/AuthContext'

jest.mock('@repo/core', () => ({
  useAdminUsers: jest.fn(),
  useAuditLogs: jest.fn(),
  useUpdateUserRole: jest.fn(),
}))

jest.mock('../../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}))

const mutate = jest.fn()

const ADMINS = [
  { id: 1, email: 'super@test.com', name: '슈퍼', adminRole: 'SUPER_ADMIN', isActive: true, createdAt: null },
  { id: 2, email: 'mod@test.com', name: null, adminRole: null, isActive: true, createdAt: null },
]

const setAuth = (user: Record<string, unknown>) => {
  ;(useAuth as jest.Mock).mockReturnValue({ user })
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useAdminUsers as jest.Mock).mockReturnValue({ data: { data: ADMINS }, isLoading: false })
  ;(useAuditLogs as jest.Mock).mockReturnValue({ data: { items: [], total: 0 }, isLoading: false })
  ;(useUpdateUserRole as jest.Mock).mockReturnValue({ mutate, isPending: false, isError: false })
  setAuth({ id: '1', name: '나', email: 'me@test.com', adminRole: 'SUPER_ADMIN' })
})

describe('Admin Settings Page — 관리자 역할 관리', () => {
  it('renders the admin-role list', () => {
    render(<AdminSettingsPage />)
    expect(screen.getByText('관리자 역할 관리')).toBeInTheDocument()
    expect(screen.getByText('super@test.com')).toBeInTheDocument()
    expect(screen.getByText('mod@test.com')).toBeInTheDocument()
    expect(screen.getByText('(이름 없음)')).toBeInTheDocument()
  })

  it('renders an empty state when no admins exist', () => {
    ;(useAdminUsers as jest.Mock).mockReturnValue({ data: { data: [] }, isLoading: false })
    render(<AdminSettingsPage />)
    expect(screen.getByText('관리자 계정이 없습니다.')).toBeInTheDocument()
  })

  it('lets a SUPER_ADMIN change a role', () => {
    render(<AdminSettingsPage />)
    const select = screen.getByLabelText('슈퍼 역할 변경')
    fireEvent.change(select, { target: { value: 'MODERATOR' } })
    expect(mutate).toHaveBeenCalledWith({ userId: 1, role: 'MODERATOR' })
  })

  it('treats a superuser without adminRole as SUPER_ADMIN', () => {
    setAuth({ id: '9', name: '루트', isSuperuser: true })
    render(<AdminSettingsPage />)
    expect(screen.getByLabelText('슈퍼 역할 변경')).toBeInTheDocument()
  })

  it('gives a non-SUPER_ADMIN a read-only list', () => {
    setAuth({ id: '2', name: '운영자', adminRole: 'MODERATOR' })
    render(<AdminSettingsPage />)
    expect(screen.queryByLabelText('슈퍼 역할 변경')).toBeNull()
    expect(screen.getByText('역할 변경은 슈퍼관리자만 가능합니다. 목록은 조회만 됩니다.')).toBeInTheDocument()
    expect(screen.getByText('역할 없음')).toBeInTheDocument()
  })

  it('surfaces a mutation error in Korean', () => {
    ;(useUpdateUserRole as jest.Mock).mockReturnValue({ mutate, isPending: false, isError: true })
    render(<AdminSettingsPage />)
    expect(screen.getByText('역할 변경에 실패했습니다. 슈퍼관리자 권한이 필요합니다.')).toBeInTheDocument()
  })
})

describe('Admin Settings Page — 감사 로그 페이징', () => {
  it('advances skip and shows the total', () => {
    ;(useAuditLogs as jest.Mock).mockReturnValue({
      data: { items: [{ id: 1, adminId: 1, action: 'LOGIN', createdAt: '2026-08-03T00:00:00Z' }], total: 25 },
      isLoading: false,
    })
    render(<AdminSettingsPage />)

    expect(useAuditLogs).toHaveBeenCalledWith({ skip: 0, limit: 10 })
    expect(screen.getByText(/총 25건/)).toBeInTheDocument()
    expect(screen.getByText('1/3 페이지')).toBeInTheDocument()
    expect(screen.getByText('이전')).toBeDisabled()

    fireEvent.click(screen.getByText('다음'))

    expect(useAuditLogs).toHaveBeenLastCalledWith({ skip: 10, limit: 10 })
    expect(screen.getByText('2/3 페이지')).toBeInTheDocument()
    expect(screen.getByText('이전')).not.toBeDisabled()
  })
})
