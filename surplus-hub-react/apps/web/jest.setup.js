import '@testing-library/jest-dom'

// AuthGate calls useAuth() before its NODE_ENV=test bypass kicks in, so every
// gated page throws without a provider. Mock the context once here instead of
// wrapping every render.
jest.mock('./src/contexts/AuthContext', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com', name: '테스트 사용자' },
    isLoading: false,
    isSignedIn: true,
    login: jest.fn(),
    signup: jest.fn(),
    loginWithGoogle: jest.fn(),
    logout: jest.fn(),
    refresh: jest.fn(),
  }),
}))

// The app router isn't mounted under @testing-library/react. Individual tests
// override this with their own factory when they need to assert on push().
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}))
