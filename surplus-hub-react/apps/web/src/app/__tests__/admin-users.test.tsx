import { render, screen, fireEvent } from '@testing-library/react'
import AdminUsersPage from '../admin/users/page'
import {
  useManagedUsers,
  useManagedUserDetail,
  useCreateSanction,
  useDeleteSanction,
  useCreateAdminNote,
} from '@repo/core'

jest.mock('@repo/core', () => ({
  useManagedUsers: jest.fn(),
  useManagedUserDetail: jest.fn(),
  useCreateSanction: jest.fn(),
  useDeleteSanction: jest.fn(),
  useCreateAdminNote: jest.fn(),
}))

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}))

const USER = {
  id: 7,
  email: 'kim@test.com',
  name: '김철수',
  adminRole: null,
  isActive: true,
  createdAt: '2026-01-02T00:00:00Z',
}

const ACTIVE_SANCTION = {
  id: 11,
  userId: 7,
  adminId: 1,
  sanctionType: 'BAN' as const,
  reason: '반복 허위 매물',
  expiresAt: null,
  isActive: true,
  createdAt: '2026-03-01T00:00:00Z',
}

const RELEASED_SANCTION = {
  id: 12,
  userId: 7,
  adminId: 1,
  sanctionType: 'WARNING' as const,
  reason: '사진 도용',
  expiresAt: '2026-04-01T00:00:00Z',
  isActive: false,
  createdAt: '2026-02-01T00:00:00Z',
}

const mutations = {
  createSanction: { mutate: jest.fn(), isPending: false, isError: false, error: null },
  deleteSanction: { mutate: jest.fn(), isPending: false, isError: false, error: null },
  createNote: { mutate: jest.fn(), isPending: false, isError: false, error: null },
}

function setupDetail(detail: Record<string, unknown> | null, extra = {}) {
  ;(useManagedUserDetail as jest.Mock).mockReturnValue({
    data: detail,
    isLoading: false,
    isError: false,
    ...extra,
  })
}

// 드로어는 행 클릭으로만 열린다.
function openDrawer() {
  render(<AdminUsersPage />)
  fireEvent.click(screen.getByText('김철수'))
}

beforeEach(() => {
  jest.clearAllMocks()
  ;(useManagedUsers as jest.Mock).mockReturnValue({
    data: { data: [USER], meta: { totalCount: 1 } },
    isLoading: false,
    isError: false,
  })
  ;(useCreateSanction as jest.Mock).mockReturnValue(mutations.createSanction)
  ;(useDeleteSanction as jest.Mock).mockReturnValue(mutations.deleteSanction)
  ;(useCreateAdminNote as jest.Mock).mockReturnValue(mutations.createNote)
  setupDetail(null)
})

describe('Admin Users Page — 사용자 상세 드로어', () => {
  it('제재 이력을 상세 훅에서 렌더한다', () => {
    setupDetail({ ...USER, sanctions: [ACTIVE_SANCTION, RELEASED_SANCTION], adminNotes: [] })
    openDrawer()

    expect(useManagedUserDetail).toHaveBeenCalledWith(7)
    expect(screen.getByText('제재 이력')).toBeInTheDocument()
    expect(screen.getByText('영구 차단')).toBeInTheDocument()
    expect(screen.getByText('반복 허위 매물')).toBeInTheDocument()
    expect(screen.getByText('만료 영구')).toBeInTheDocument()
    expect(screen.getByText('적용 중')).toBeInTheDocument()
    // 해제된 제재는 해제됨으로 표시되고 해제 버튼이 없다
    expect(screen.getByText('해제됨')).toBeInTheDocument()
    expect(screen.getAllByText('제재 해제')).toHaveLength(1)
  })

  it('확인을 누르면 제재 해제가 mutate를 호출한다', () => {
    setupDetail({ ...USER, sanctions: [ACTIVE_SANCTION], adminNotes: [] })
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true)
    openDrawer()

    fireEvent.click(screen.getByText('제재 해제'))

    expect(confirmSpy).toHaveBeenCalled()
    expect(mutations.deleteSanction.mutate).toHaveBeenCalledWith(
      { userId: 7, sanctionId: 11 },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    )
    confirmSpy.mockRestore()
  })

  it('확인을 취소하면 제재 해제가 발생하지 않는다', () => {
    setupDetail({ ...USER, sanctions: [ACTIVE_SANCTION], adminNotes: [] })
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false)
    openDrawer()

    fireEvent.click(screen.getByText('제재 해제'))

    expect(mutations.deleteSanction.mutate).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('메모를 추가할 수 있고 공백만 입력하면 비활성이다', () => {
    setupDetail({ ...USER, sanctions: [], adminNotes: [] })
    openDrawer()

    const submit = screen.getByText('메모 추가')
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('메모 입력'), { target: { value: '   ' } })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('메모 입력'), { target: { value: ' 전화 확인함 ' } })
    expect(submit).not.toBeDisabled()
    fireEvent.click(submit)

    expect(mutations.createNote.mutate).toHaveBeenCalledWith(
      { userId: 7, content: '전화 확인함' },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    )
  })

  it('기존 메모를 작성자와 날짜로 렌더한다', () => {
    setupDetail({
      ...USER,
      sanctions: [],
      adminNotes: [{ id: 3, userId: 7, adminId: 2, content: '재확인 필요', createdAt: '2026-03-05T00:00:00Z' }],
    })
    openDrawer()

    expect(screen.getByText('재확인 필요')).toBeInTheDocument()
    expect(screen.getByText(/관리자 #2/)).toBeInTheDocument()
  })

  it('제재·메모가 없으면 각각 빈 상태를 렌더한다', () => {
    setupDetail({ ...USER, sanctions: [], adminNotes: [] })
    openDrawer()

    expect(screen.getByText('제재 이력이 없습니다.')).toBeInTheDocument()
    expect(screen.getByText('등록된 메모가 없습니다.')).toBeInTheDocument()
  })

  it('상세 로딩 중에도 목록 행 정보로 헤더를 즉시 보여준다', () => {
    setupDetail(null, { isLoading: true })
    openDrawer()

    expect(screen.getByText('사용자 상세')).toBeInTheDocument()
    // 목록 행 + 드로어 헤더 두 곳 → fallback이 살아있다는 뜻
    expect(screen.getAllByText('kim@test.com')).toHaveLength(2)
    expect(screen.queryByText('제재 이력이 없습니다.')).toBeNull()
  })

  it('403이면 한국어 권한 오류를 노출한다', () => {
    setupDetail({ ...USER, sanctions: [ACTIVE_SANCTION], adminNotes: [] })
    ;(useDeleteSanction as jest.Mock).mockReturnValue({
      ...mutations.deleteSanction,
      isError: true,
      error: { response: { status: 403 } },
    })
    openDrawer()

    expect(screen.getByText('권한이 없습니다. 관리자 이상만 가능한 작업입니다.')).toBeInTheDocument()
  })
})
