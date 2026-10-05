import { apiClient, fetchManagedUsers, fetchAdminUserStats } from '@repo/core'

// 백엔드 Query alias(isActive/adminRole)와 어긋나면 필터가 에러 없이 무시된다.
describe('admin API query params', () => {
  const get = jest.spyOn(apiClient, 'get')

  beforeEach(() => {
    get.mockReset()
    get.mockResolvedValue({ data: { status: 'success', data: { items: [], total: 0 } } })
  })

  it('sends camelCase filter params to /admin/users', async () => {
    await fetchManagedUsers({ isActive: false, adminRole: 'MODERATOR' })
    expect(get.mock.calls[0][1]?.params).toEqual({
      skip: 0,
      limit: 50,
      isActive: false,
      adminRole: 'MODERATOR',
    })
  })

  it('widens the stats window for month view', async () => {
    await fetchAdminUserStats('month')
    expect(get.mock.calls[0][1]?.params).toEqual({ period: 'month', days: 365 })
  })
})
