import { expect, test } from '@playwright/test'

import { API_BASE, buildMockUser, mockDashboardOverview, mockGuestSession } from './helpers/api-mocks'

test('protected dashboard route redirects guest users to login', async ({ page }) => {
  await mockGuestSession(page)
  await page.goto('/app/dashboard')

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByText('Continue where you left off.')).toBeVisible()
  await expect(page.getByPlaceholder('you@example.com')).toBeVisible()
  await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible()
})

test('student can sign in and reach dashboard with mocked API', async ({ page }) => {
  const user = buildMockUser('student')
  let authenticated = false

  await page.route(`${API_BASE}/api/auth/providers`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ providers: [] }),
    })
  })

  await page.route(`${API_BASE}/api/auth/me`, async (route) => {
    if (authenticated) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(user),
      })
      return
    }
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Authentication required.' }),
    })
  })

  await page.route(`${API_BASE}/api/auth/login`, async (route) => {
    authenticated = true
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        expires_at: '2026-12-31T00:00:00+00:00',
        user,
      }),
    })
  })

  await mockDashboardOverview(page)

  await page.goto('/login')
  await page.getByPlaceholder('you@example.com').fill(user.email)
  await page.getByPlaceholder('Minimum 8 characters').fill('PytestPass123!')
  await Promise.all([
    page.waitForResponse((response) => response.url() === `${API_BASE}/api/auth/login` && response.ok()),
    page.getByRole('button', { name: /^Sign In$/ }).click(),
  ])

  await expect(page).toHaveURL(/\/app\/dashboard$/)
  await expect(page.getByRole('banner').getByText('Dashboard')).toBeVisible()
  await expect(page.getByText('Your learning overview')).toBeVisible()
  await expect(page.getByText('Signs Mastered')).toBeVisible()
  await expect(page.getByText('18')).toBeVisible()
  await expect(page.getByText('Review Letter H')).toBeVisible()
})
