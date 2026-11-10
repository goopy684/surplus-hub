import { render, screen } from '@testing-library/react'
import ChatRoomPage from '../chat/[id]/page'
import {
  BUYER_QUICK_REPLIES,
  SELLER_QUICK_REPLIES,
  getQuickReplies,
  useChatRoomDetail,
  useCurrentUser,
} from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  useChatMessages: () => ({ data: { data: [] }, isLoading: false }),
  useChatRoomDetail: jest.fn(),
  useCurrentUser: jest.fn(),
  useSendMessage: () => ({ mutate: jest.fn() }),
  useChatWebSocket: () => ({
    isConnected: false, sendTextMessage: jest.fn(), sendReadReceipt: jest.fn(), sendTyping: jest.fn(), typingUser: null,
  }),
}))

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn()
})

const room = {
  id: '4', materialId: '14', materialTitle: '철근', sellerId: '1',
  otherUser: { id: '1', name: '김판매' }, unreadCount: 0, updatedAt: '',
}

describe('SH-43 채팅방 — 상대 이름·역할별 빠른 답장', () => {
  it('구매자에게는 상대방 이름과 구매자용 빠른 답장을 보여준다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '3' } })
    ;(useChatRoomDetail as jest.Mock).mockReturnValue({ data: room })
    render(<ChatRoomPage params={{ id: '4' }} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('김판매')
    expect(screen.getByRole('button', { name: BUYER_QUICK_REPLIES[0] })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '재고 남아있습니다' })).toBeNull()
  })

  it('판매자에게는 판매자용 빠른 답장을 보여준다', () => {
    ;(useCurrentUser as jest.Mock).mockReturnValue({ data: { id: '1' } })
    ;(useChatRoomDetail as jest.Mock).mockReturnValue({ data: { ...room, otherUser: { id: '3', name: '이구매' } } })
    render(<ChatRoomPage params={{ id: '4' }} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('이구매')
    expect(screen.getByRole('button', { name: '재고 남아있습니다' })).toBeInTheDocument()
  })

  it('역할을 모르면(로딩 중) 어느 쪽 문구도 고르지 않는다', () => {
    expect(getQuickReplies(undefined, '1')).toEqual([])
    expect(getQuickReplies('1', undefined)).toEqual([])
    expect(getQuickReplies('1', '1')).toBe(SELLER_QUICK_REPLIES)
  })
})
