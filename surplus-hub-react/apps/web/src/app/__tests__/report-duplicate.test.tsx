import { render, screen, fireEvent } from '@testing-library/react'
import { ReportModal } from '../../components/ReportModal'
import { createReport } from '@repo/core'

jest.mock('@repo/core', () => ({
  ...jest.requireActual('@repo/core'),
  createReport: jest.fn(),
}))

const conflict = (detail?: string) => ({ response: { status: 409, data: { detail } } })

describe('SH-40 — duplicate report', () => {
  it('tells the user they already reported it', async () => {
    ;(createReport as jest.Mock).mockRejectedValue(conflict('You have already reported this'))
    render(<ReportModal isOpen onClose={() => {}} targetType="post" targetId={6} targetLabel="게시글" />)
    fireEvent.click(screen.getByRole('button', { name: '신고 접수' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('이미 신고한 게시글입니다.')
  })
})
