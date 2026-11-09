import { render, screen } from '@testing-library/react'
import ProfilePage from '../profile/page'
import { useCurrentUser, useUserStats } from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  useCurrentUser: jest.fn(),
  useUserStats: jest.fn(),
}))

beforeEach(() => {
  ;(useUserStats as jest.Mock).mockReturnValue({ data: undefined, isLoading: false })
})

describe('SH-43 프로필 인증 배지', () => {
  it('가입 기본 trustLevel(1)인 미인증 계정에는 인증 배지를 보이지 않는다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '1', name: '신규', trustLevel: 1 }, isLoading: false })
    render(<ProfilePage />)
    expect(screen.queryByTestId('profile-trust-badge')).toBeNull()
    expect(screen.queryByText('인증회원')).toBeNull()
  })

  it('사업자 인증(trustLevel >= 80)을 마친 계정에만 배지를 보인다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '1', name: '인증', trustLevel: 85 }, isLoading: false })
    render(<ProfilePage />)
    expect(screen.getByTestId('profile-trust-badge')).toHaveTextContent('사업자 인증 완료')
  })
})
