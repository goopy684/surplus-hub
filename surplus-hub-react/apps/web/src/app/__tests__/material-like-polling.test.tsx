import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMaterialLikeStatus } from '@repo/core'
import { checkMaterialLike } from '../../../../../packages/core/src/api'

jest.mock('../../../../../packages/core/src/api', () => ({
  ...jest.requireActual('../../../../../packages/core/src/api'),
  checkMaterialLike: jest.fn(),
}))

describe('SH-43 관심 수 — 열린 화면에 다른 사용자 반영', () => {
  it('화면을 다시 열지 않아도 주기적으로 관심 상태를 재조회한다', async () => {
    jest.useFakeTimers()
    localStorage.setItem('access_token', 'tok')
    ;(checkMaterialLike as jest.Mock)
      .mockResolvedValueOnce({ liked: false, likesCount: 0 })
      .mockResolvedValue({ liked: false, likesCount: 3 })

    const client = new QueryClient()
    const wrapper = ({ children }: { children?: unknown }) => (
      // 워크스페이스에 React 타입이 여러 버전이라 providers.tsx처럼 children 캐스트가 필요하다
      <QueryClientProvider client={client}>{children as never}</QueryClientProvider>
    )
    const { result } = renderHook(() => useMaterialLikeStatus('7'), { wrapper })
    await waitFor(() => expect(result.current.data?.likesCount).toBe(0))

    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    await waitFor(() => expect(result.current.data?.likesCount).toBe(3))

    client.clear()
    jest.useRealTimers()
  })
})
