import type { Page, Route } from '@playwright/test'

export const API_BASE = 'http://localhost:8000'

type UserRole = 'student' | 'teacher' | 'admin'

type MockUser = {
  id: number
  email: string
  display_name: string
  role: UserRole
  age: number | null
  bio: string | null
  avatar_url: string | null
  created_at: string
}

export async function mockGuestSession(page: Page) {
  await page.route(`${API_BASE}/api/auth/providers`, async (route) => {
    await route.fulfill(jsonResponse({ providers: [] }))
  })
  await page.route(`${API_BASE}/api/auth/me`, async (route) => {
    await route.fulfill(jsonResponse({ detail: 'Authentication required.' }, 401))
  })
}

export async function mockAuthenticatedSession(page: Page, user: MockUser) {
  await page.route(`${API_BASE}/api/auth/providers`, async (route) => {
    await route.fulfill(jsonResponse({ providers: [] }))
  })
  await page.route(`${API_BASE}/api/auth/me`, async (route) => {
    await route.fulfill(jsonResponse(user))
  })
}

export async function mockLoginSuccess(page: Page, user: MockUser) {
  await page.route(`${API_BASE}/api/auth/login`, async (route) => {
    await route.fulfill(
      jsonResponse({
        expires_at: '2026-12-31T00:00:00+00:00',
        user,
      }),
    )
  })
}

export async function mockDashboardOverview(page: Page) {
  await page.route(`${API_BASE}/api/dashboard/overview`, async (route) => {
    await route.fulfill(
      jsonResponse({
        stats: {
          signs_mastered: 18,
          practice_streak: 4,
          live_accuracy: 92,
          translations_this_week: 6,
          daily_goal_percent: 70,
          daily_goal_remaining_minutes: 9,
          rank_label: 'Level 4 Learner',
        },
        recent_translations: [
          {
            id: 1,
            source_type: 'alphabet-coach',
            transcript: 'Completed alphabet practice',
            confidence: 96,
            created_at: '2026-05-17T10:00:00+00:00',
            status_label: 'High Accuracy',
          },
        ],
        recent_detections: ['A', 'B', 'C'],
        categories: [
          { name: 'Alphabet Coach', mastered: 12, percent: 100 },
        ],
        insight: {
          headline: 'Review Letter H',
          detail: 'Letter H is slightly behind your other signs and is the next best focus area.',
        },
      }),
    )
  })
}

export function buildMockUser(role: UserRole): MockUser {
  return {
    id: role === 'teacher' ? 2 : role === 'admin' ? 3 : 1,
    email: `${role}@example.com`,
    display_name: role === 'student' ? 'Test Student' : role === 'teacher' ? 'Test Teacher' : 'Test Admin',
    role,
    age: null,
    bio: null,
    avatar_url: null,
    created_at: '2026-05-17T10:00:00+00:00',
  }
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  }
}

export async function blockUnexpectedApi(page: Page) {
  await page.route(`${API_BASE}/**`, async (route: Route) => {
    const request = route.request()
    await route.fulfill(
      jsonResponse(
        {
          detail: `Unexpected API request during Playwright test: ${request.method()} ${request.url()}`,
        },
        500,
      ),
    )
  })
}
