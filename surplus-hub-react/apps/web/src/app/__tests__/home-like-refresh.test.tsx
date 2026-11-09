import { render, screen, fireEvent, within } from '@testing-library/react'
import Home from '../page'
import { mergeMaterialPage, useMaterials } from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  useMaterials: jest.fn(),
}))

const item = (id: number, likesCount = 0) => ({
  id: String(id), title: `자재 ${id}`, description: '', price: 1000, status: 'ACTIVE',
  sellerId: '1', category: '기타', location: '서울', createdAt: '2026-11-08T00:00:00Z', likesCount,
})

describe('SH-43 홈 목록 — 재조회한 관심 수를 이미 보이는 카드에 반영', () => {
  it('mergeMaterialPage는 이미 있는 매물을 새 값으로 덮고 새 매물만 뒤에 붙인다', () => {
    const merged = mergeMaterialPage([item(1, 0), item(2, 0)], [item(2, 5), item(3, 0)], 2)
    expect(merged.map((m) => [m.id, m.likesCount])).toEqual([['1', 0], ['2', 5], ['3', 0]])
    expect(mergeMaterialPage([item(1)], [item(9)], 1)).toEqual([item(9)])
  })

  it('2페이지 재조회(포커스 복귀) 결과의 관심 수가 카드에 보인다', () => {
    const page1 = { data: Array.from({ length: 20 }, (_, i) => item(i + 1)) }
    let page2 = { data: [item(21, 1)] }
    ;(useMaterials as jest.Mock).mockImplementation((params: { page: number }) => ({
      data: params.page === 1 ? page1 : page2, isLoading: false, isFetching: false, error: null,
    }))

    const { rerender } = render(<Home />)
    fireEvent.click(screen.getByRole('button', { name: '더 보기' }))
    const card = () => screen.getByText('자재 21').closest('a') as HTMLElement
    expect(within(card()).getByText('1')).toBeInTheDocument()

    page2 = { data: [item(21, 4)] }
    rerender(<Home />)
    expect(within(card()).getByText('4')).toBeInTheDocument()
  })
})
